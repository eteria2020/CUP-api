var expo = require('../index').expo;
var pg = expo.pg;
var conString = expo.conString;
//var port = expo.port;
var validator = expo.validator;
var defaultDistance = expo.defaultDistance;

module.exports = {
    /* GET */

    /**
     * get user details
     * @param  array   req  request
     * @param  array   res  response
     * @param  function next handler
     */
    getUser: function (req, res, next) {
        //var bonus = 0;
        if (sanitizeInput(req, res)) {

            pg.connect(conString, function (err, client, done) {

                if (err) {
                    done();
                    console.log('Errore getUser connect', err);
                    next.ifError(err);
                }

                var user_lat = '';
                var user_lon = '';

                if (typeof req.params.user_lat !== 'undefined' && typeof req.params.user_lon !== 'undefined') {
                    user_lat = req.params.user_lat;
                    user_lon = req.params.user_lon;
                }

                client.query(
                        "SELECT SUM(residual)as bonus FROM customers_bonus WHERE customer_id=$1 AND (valid_to >now() OR valid_to IS NULL)",
                        [req.user.id],
                        function (err, result) {
                            done();
                            if (err) {
                                console.log('Errore getUser count', err);
                                next.ifError(err);
                            }

                            if (user_lat != '' && user_lon != '') {
                                var sqlLoc = "INSERT INTO customer_locations (customer_id, latitude, longitude, action, timestamp, car_plate,ip,port) values ($1,$2, $3, $4 , now(), $5 ,$6,$7)";
                                var paramsLoc = [req.user.id, user_lat, user_lon, "login", null,req.connection.remoteAddress,req.connection.remotePort];
                                client.query(sqlLoc,
                                        paramsLoc,
                                        function (err, result) {
                                            done();
                                            if (err) {
                                                console.log('Errore postReservations insert location', err);
                                                next.ifError(err);
                                            }
                                        }
                                );
                            }

                            req.user.bonus = result.rows[0].bonus;
                            delete req.user.id;
                            delete req.user.password;
                            delete req.user.card_code;
                            req.user.pin = req.user.pin.primary;
                            sendOutJSON(res, 200, '', req.user);
                        }
                );
            });


        }
        return next();
    },
    /**
     * get car details
     * @param  array   req  request
     * @param  array   res  response
     * @param  function next handler
     */
    getCars: function (req, res, next) {
        if (sanitizeInput(req, res)) {
            pg.connect(conString, function (err, client, done) {

                if (err) {
                    done();
                    console.log('Errore getCars connect', err);
                    next.ifError(err);
                }

                client.query(
                    "SELECT conditions as conditions FROM free_fares WHERE active = TRUE",
                    function (err, result) {
                        done();
                        if (err) {
                            console.log('Error free_fares', err);
                            next.ifError(err);
                        }
                        var unplugValue = 0;
                        var freeFares = [];
                        var caseFree = '';
                        var verify = 0;
                        if (typeof result !== 'undefined' && (result.rowCount > 0)) {
                            for (i = 0; i < result.rowCount; i++) {
                                freeFares[i] = JSON.parse(result.rows[i].conditions);
                                if (typeof freeFares[i].car !== 'undefined') {
                                    if (freeFares[i].car.type === 'nouse') {
                                        if (typeof freeFares[i].car.fleet === 'undefined') {
                                            continue;
                                        }
                                        var now = new Date();
                                        if (typeof freeFares[i].car.dow[now.getDay().toString()] === 'undefined') {
                                            continue;
                                        } else {
                                            var timeInterval = freeFares[i].car.dow[now.getDay().toString()].split("-");
                                            if (typeof freeFares[i].car.max === 'undefined') {
                                                caseFree += " WHEN (ROUND(EXTRACT('epoch' from (now() - nouse)) / 60) >= " + freeFares[i].car.hour * 60 +
                                                    " AND cars.fleet_id = " + freeFares[i].car.fleet +
                                                    " AND cars.battery > " + freeFares[i].car.soc +
                                                    " AND now() >= (date 'now()' + time '" + timeInterval[0] +
                                                    "') AND now() <= (date 'now()' + time '" + timeInterval[1] + "')) THEN " + freeFares[i].car.value;
                                            } else {
                                                caseFree += " WHEN (ROUND(EXTRACT('epoch' from (now() - nouse)) / 60) >= " + freeFares[i].car.hour * 60 +
                                                    " AND ROUND(EXTRACT('epoch' from (now() - nouse)) / 60) < " + freeFares[i].car.max * 60 +
                                                    " AND cars.fleet_id = " + freeFares[i].car.fleet +
                                                    " AND cars.battery > " + freeFares[i].car.soc +
                                                    " AND now() >= (date 'now()' + time '" + timeInterval[0] +
                                                    "') AND now() <= (date 'now()' + time '" + timeInterval[1] + "')) THEN " + freeFares[i].car.value;
                                            }
                                            verify++;
                                        }
                                    } else if (freeFares[i].car.type === 'unplug') {
                                        if (typeof freeFares[i].car.value !== 'undefined') {
                                            unplugValue = freeFares[i].car.value;
                                        }
                                    }
                                }
                            }
                        }
                        if (verify === 0) {
                            caseFree = ' WHEN TRUE THEN 0 '; //to improve
                        }

                        var unplugCase = "";
                        var unplugCase2 = "";

                        if(unplugValue>0) {
                            unplugCase = ", unplug_enable, CASE WHEN unplug_enable THEN " + unplugValue + " ELSE 0 END AS unplug_value ";
                            unplugCase2 = ", cars_bonus.unplug_enable ";
                        }

                        var query = '', params = [], queryString = '', isSingle = false;

                        var freeCarCond = " AND " +
                            "status = 'operative' AND " +
                            "active IS TRUE AND " +
                            "busy IS FALSE AND " +
                            "hidden IS FALSE AND " +
                            "plate NOT IN (" +
                                "SELECT car_plate FROM reservations WHERE active is TRUE) ";

                        var fleetsSelect = ", json_build_object('id',cars.fleet_id,'label',fleets.name) AS fleets ";
                        var fleetsJoin = " LEFT JOIN fleets ON cars.fleet_id = fleets.id ";

                        var bonusJoin = " LEFT JOIN ( " +
                            "SELECT car_plate, nouse_bool as nouse_value, CASE WHEN nouse_bool != 0 THEN TRUE ELSE FALSE end as nouse_bool " + unplugCase +
                            "FROM (SELECT car_plate, case " + caseFree + " else 0 end as nouse_bool " + unplugCase2 +
                            "FROM cars LEFT JOIN cars_bonus ON cars.plate = cars_bonus.car_plate) AS cars_free) AS cars_bonus ON cars.plate = cars_bonus.car_plate ";

                        var bonusSelect = ", json_build_array(json_build_object('type','nouse', 'value', nouse_value ,'status', cars_bonus.nouse_bool)) AS bonus ";
                        if(unplugValue>0) {
                             bonusSelect = ", json_build_array(json_build_object('type','unplug', 'value', unplug_value ,'status', cars_bonus.unplug_enable)) AS bonus ";
                         }

                        if (typeof req.params.plate === 'undefined') {
                            if (typeof req.params.status !== 'undefined') {
                                queryString += ' AND status = $4 ';
                                params[3] = req.params.status;
                            }
                            if (typeof req.params.lat !== 'undefined' && typeof req.params.lon !== 'undefined') {
                                queryString += ' AND ST_Distance_Sphere(ST_SetSRID(ST_MakePoint(cars.longitude, cars.latitude), 4326),ST_SetSRID(ST_MakePoint($2, $1), 4326)) < $3::int ';
                                params[0] = req.params.lat;
                                params[1] = req.params.lon;
                                params[2] = req.params.radius || defaultDistance;
                            }

                            query = "SELECT cars.*" + fleetsSelect + bonusSelect + " FROM cars " + fleetsJoin + bonusJoin + " WHERE cars.fleet_id <= 100 " + queryString;
                        } else {
                            // single car
                            query = "SELECT cars.*" + fleetsSelect + bonusSelect + " FROM cars " + fleetsJoin + bonusJoin + " WHERE plate = $1";
                            params = [req.params.plate];
                            isSingle = true;
                        }
                        if (!isSingle) {
                            query += freeCarCond;
                        }

                        //console.log('Query ', query);
                        client.query(
                                query,
                                params,
                                function (err, result) {
                                    done();
                                    if (err) {
                                        console.log('Errore getCars select', err);
                                        next.ifError(err);
                                    }
                                    var outTxt = '', outJson = null;
                                    if ((typeof result !== 'undefined') && (result.rowCount > 0)) {
                                        outJson = !isSingle ? result.rows : result.rows[0];
                                    } else {
                                        outTxt = 'No cars found';
                                    }
                                    sendOutJSON(res, 200, outTxt, outJson);
                                }
                        );
                    }
                );
            });
        }
        return next();
    },
    getCarsLight: function (req, res, next) {
        if (sanitizeInput(req, res)) {
            pg.connect(conString, function (err, client, done) {

                if (err) {
                    done();
                    console.log('Errore getCars connect', err);
                    next.ifError(err);
                }

                var user_lat = '';
                var user_lon = '';
                var callingApp = '';
                var email = '';
               

                if (typeof req.params.user_lat !== 'undefined' && typeof req.params.user_lon !== 'undefined' && typeof req.params.callingApp !== 'undefined') {
                    user_lat = req.params.user_lat;
                    user_lon = req.params.user_lon;
                    callingApp = req.params.callingApp ;
                    if(typeof req.params.email !== 'undefined'){
                         email = req.params.email;
                    }
                }

                client.query(
                        "SELECT conditions as conditions FROM free_fares WHERE active = TRUE",
                        function (err, result) {
                            done();
                            if (err) {
                                console.log('Error free_fares', err);
                                next.ifError(err);
                            }
                            var unplugValue = 0;
                            var freeFares = [];
                            var caseFree = '';

                            if (typeof result !== 'undefined' && (result.rowCount > 0)) {
                                for (i = 0; i < result.rowCount; i++) {
                                    freeFares[i] = JSON.parse(result.rows[i].conditions);
                                    if (typeof freeFares[i].car !== 'undefined') {
                                        if (freeFares[i].car.type === 'nouse') {
                                            if (typeof freeFares[i].car.fleet === 'undefined') {
                                                continue;
                                            }
                                            var now = new Date();
                                            if (typeof freeFares[i].car.dow[now.getDay().toString()] === 'undefined') {
                                                continue;
                                            } else {
                                                var timeInterval = freeFares[i].car.dow[now.getDay().toString()].split("-");
                                                if (typeof freeFares[i].car.max === 'undefined') {
                                                    caseFree += " WHEN (ROUND(EXTRACT('epoch' FROM (NOW() - nouse)) / 60) >= " + freeFares[i].car.hour * 60 +
                                                        " AND cars.fleet_id = " + freeFares[i].car.fleet +
                                                        " AND cars.battery > " + freeFares[i].car.soc +
                                                        " AND now() >= (date 'now()' + time '" + timeInterval[0] +
                                                        "') AND now() <= (date 'now()' + time '" + timeInterval[1] + "')) THEN " + freeFares[i].car.value;
                                                } else {
                                                    caseFree += " WHEN (ROUND(EXTRACT('epoch' FROM (NOW() - nouse)) / 60) >= " + freeFares[i].car.hour * 60 +
                                                        " AND ROUND(EXTRACT('epoch' FROM (NOW() - nouse)) / 60) < " + freeFares[i].car.max * 60 +
                                                        " AND cars.fleet_id = " + freeFares[i].car.fleet +
                                                        " AND cars.battery > " + freeFares[i].car.soc +
                                                        " AND now() >= (date 'now()' + time '" + timeInterval[0] +
                                                        "') AND now() <= (date 'now()' + time '" + timeInterval[1] + "')) THEN " + freeFares[i].car.value;
                                                }

                                            }
                                        } else if (freeFares[i].car.type === 'unplug') {
                                            if (typeof freeFares[i].car.value !== 'undefined') {
                                                unplugValue = freeFares[i].car.value;
                                            }
                                        }
                                    }
                                } // end loop
                            }

                            if (caseFree ==="") {
                                caseFree = ' WHEN true THEN 0 '; //to improve
                            }

                            var caseUnplug = "0 unplug_val ";
                            if(unplugValue>0){
                                caseUnplug = "CASE WHEN cars_bonus.unplug_enable THEN " + unplugValue + " ELSE 0 END AS unplug_val ";
                            };

                            var statusCondition ="";
                            if (typeof req.params.status !== 'undefined') {
                                statusCondition = " AND cars.status = '" + req.params.status + "' ";
                            }

                            var query3SelectSingleCar = "";
                            var query3Where =  " cars.fleet_id <= 100 AND " +
                                "cars.status = 'operative' AND " +
                                "cars.active IS TRUE AND " +
                                "cars.busy IS FALSE AND " +
                                "cars.hidden IS FALSE AND " +
                                "cars.plate NOT IN (SELECT car_plate FROM reservations WHERE active IS TRUE) " +
                                statusCondition;

                            var isSingle = false;
                            if (typeof req.params.plate !== 'undefined') {
                                isSingle = true;
                                query3SelectSingleCar = " cars.*, ";
                                query3Where = " cars.plate = '" + req.params.plate + "' " + statusCondition;
                            }

                            var distSelectCondition1 = " 0 AS dist, ";
                            var query4Where = " 1=1 ";
                            if (typeof req.params.lat !== 'undefined' && typeof req.params.lon !== 'undefined') {
                                distSelectCondition1 = "ST_Distance_Sphere(ST_SetSRID(ST_MakePoint(cars.longitude, cars.latitude), 4326) ," +
                                    "ST_SetSRID(ST_MakePoint(" + req.params.lon + "," + req.params.lat + "), 4326)) AS dist, ";
                                var distance = req.params.radius || defaultDistance;
                                query4Where = " dist < " + distance + "::int ORDER BY dist ASC ";
                            }

                            var query1 = "SELECT car_plate, CASE " + caseFree + " ELSE 0 END as nouse_val, " + caseUnplug +
                                "FROM cars " +
                                "LEFT JOIN cars_bonus ON cars.plate = cars_bonus.car_plate";

                            var query2 = "SELECT " +
                                "car_plate, " +
                                "CASE WHEN unplug_val>0 THEN 'unplug' ELSE 'nouse' END AS bonus_name, " +
                                "CASE WHEN unplug_val>0 THEN unplug_val WHEN nouse_val>0 THEN nouse_val ELSE 0 END AS bonus_value, " +
                                "CASE WHEN unplug_val>0 OR nouse_val>0 THEN true ELSE false END AS bonus_status " +
                                "FROM (" +
                                 query1 +
                                ") AS cars_free ";

                            var query3 = "SELECT " +
                                query3SelectSingleCar +
                                "cars.plate, " +
                                "cars.longitude AS lon, " +
                                "cars.latitude AS lat, " +
                                "cars.battery AS soc, " +
                                "cars.fleet_id, " +
                                distSelectCondition1 +
                                "json_build_array(json_build_object('type', bonus_name, 'value', bonus_value ,'status', bonus_status)) AS bonus " +
                                "FROM cars  LEFT JOIN ( " +
                                query2 +
                                ") AS cars_bonus ON cars.plate = cars_bonus.car_plate " +
                                "WHERE " + query3Where;

                            var query4 = "WITH RECURSIVE tab(plate,lon,lat,soc,fleet_id,dist,bonus) AS ( " +
                                query3 +
                                ") " +
                                "SELECT plate,lon,lat,soc,fleet_id,round(dist) AS dist,bonus FROM tab " +
                                "WHERE " + query4Where;

                            if(isSingle) {
                                query4 = query3;
                            }

                            var params = [];

                            //console.log('Query4 ', query4);
                            client.query(
                                    query4,
                                    params,
                                    function (err, result) {
                                        done();
                                        var outTxt = '', outJson = null;
                                        if (err) {
                                            console.log('Errore getCars select', err);
                                            sendOutJSON(res, 400, err, outJson);
                                            next.ifError(err);
                                        }
                                        if ((typeof result !== 'undefined') && (result.rowCount > 0)) {
                                            outJson = !isSingle ? result.rows : result.rows[0];
                                        } else {
                                            outTxt = 'No cars found';
                                        }



                                        sendOutJSON(res, 200, outTxt, outJson);
                                        
                                        if (user_lat != '' && user_lon != ''&& callingApp != '') {
                                            var userId = 0;

                                            if(email != '' ){
                                            var sqlGetId = "SELECT id FROM customers where email = $1";
                                            var paramsGetId = [email];
                                            client.query(sqlGetId,
                                                paramsGetId,
                                                function (err, result) {
                                                    
                                                    if (err) {
                                                        console.log('Errore getCarsLight insert location', err);
                                                        next.ifError(err);
                                                    }
                                                    if (typeof result !== 'undefined' && result.rows.length > 0) {
                                                        userId = result.rows[0].id;
                                                    }

                                                    var sqlLoc = "INSERT INTO customer_locations (customer_id, latitude, longitude, action, timestamp, car_plate, ip, port, calling_app) values ($1,$2, $3, $4 , now(), $5 , $6, $7, $8)";
                                                    var paramsLoc = [userId, user_lat, user_lon, "create reservation", req.params.plate,req.connection.remoteAddress,req.connection.remotePort, callingApp];
                                                    client.query(sqlLoc,
                                                        paramsLoc,
                                                        function (err, result) {
                                                            done();
                                                            if (err) {
                                                                console.log('Errore getCarsLight insert location', err);
                                                                next.ifError(err);
                                                            }
                                                        }
                                                    );                                                    
                                                }
                                            );
                                            }else{
                                                var sqlLoc = "INSERT INTO customer_locations (customer_id, latitude, longitude, action, timestamp, car_plate, ip, port, calling_app) values ($1,$2, $3, $4 , now(), $5 , $6, $7, $8)";
                                                var paramsLoc = [userId, user_lat, user_lon, "create reservation", req.params.plate,req.connection.remoteAddress,req.connection.remotePort, callingApp];
                                                client.query(sqlLoc,
                                                    paramsLoc,
                                                    function (err, result) {
                                                        done();
                                                        if (err) {
                                                            console.log('Errore getCarsLight insert location', err);
                                                            next.ifError(err);
                                                        }
                                                    }
                                                );       
                                            }
                                           
                                        }
                                    }
                            );
                        }
                );
            });
        }
        return next();
    },
    //getLastTrips function for safo
    getLastTrips: function (req, res, next) {
        if (sanitizeInput(req, res)) {
            pg.connect(conString, function (err, client, done) {
                if (err) {
                    done();
                    console.log('Errore getLastTrips connect', err);
                    next.ifError(err);
                }
                var plate = "test";
                var error = "no_error";
                var timestamp = "";


                try {
                    json_parsed = JSON.parse(req.body);
                } catch (err) {
                    error = "JSON is not valid";
                }

                try {
                    plate = json_parsed.vehicle_license_plate;
                    plate = plate.toUpperCase();
                } catch (err) {
                    error = "Vehicle license plate is not valid";
                }

                try {
                    json_parsed = JSON.parse(req.body);
                    timestamp = json_parsed.violation_timestamp;
                    var test_date = new Date(timestamp);
                    timestamp = test_date.toISOString().replace(/T/, ' ').replace(/\..+/, '');

                    if ((typeof timestamp !== 'undefined')) {
                        if (timestamp.length <= 0) {
                            error = "Date is not valid";
                        }
                    } else {
                        error = "Date is not valid";
                    }
                } catch (err) {
                    error = "Date is not valid";
                }
                if (error != "Date is not valid") {
                    timestamp = json_parsed.violation_timestamp;
                }

                if (plate === null || plate === "null" || plate.length < 1) {
                    error = "Vehicle license plate is not valid";
                }

                if (error == "Date is not valid") {
                    var query_exist = "select true as \"is_vehicle_sharing\",manufactures as \"vehicle_manufacturer\",model as \"vehicle_model\",trips.fleet_id as \"vehicle_fleet_id\",trips.id as \"trip_id\",timestamp_beginning::text as \"trip_beginning_timestamp\",address_beginning as \"trip_beginning_address\",timestamp_end::text as \"trip_end_timestamp\",address_end as \"trip_end_address\",customer_id,customers.name as \"customer_name\",customers.surname as \"customer_surname\",customers.tax_code as \"customer_tax_code\",customers.maintainer as \"customer_is_operator\",customers.address as \"customer_address\",customers.zip_code as \"customer_zip_code\",customers.town as \"customer_town\",customers.province as \"customer_province\",customers.birth_country as \"customer_country\",customers.email as \"customer_email\",customers.driver_license as \"customer_driver_license_number\",customers.driver_license_categories as \"customer_driver_license_categories\",customers.driver_license_country as \"customer_driver_license_country\",customers.driver_license_release_date::text as \"customer_driver_license_release_date\",customers.driver_license_expire::text as \"customer_driver_license_expiration_date\",customers.driver_license_country as \"customer_driver_license_release_town\",customers.driver_license_authority as \"customer_driver_license_release_authority\",customers.birth_date::text as \"customer_birth_date\",customers.birth_town::text as \"customer_birth_town\" from trips,cars,customers where customers.id=trips.customer_id and car_plate=plate AND car_plate='" + plate + "' AND timestamp_beginning<=now() AND timestamp_end<=now() AND timestamp_beginning<=timestamp_end AND (timestamp_end - timestamp_beginning < '24:00:00') ORDER BY timestamp_beginning DESC limit 1";
                    client.query(
                            query_exist,
                            function (err, result) {
                                done();
                                console.log('getLastTrips select exist', err);
                                //console.log(result);
                                if (typeof result !== 'undefined') {
                                    outTxt = '';
                                    sendOutJSON(res, 200, outTxt, result.rows[0]);
                                } else {
                                    outTxt = 'No car found.';
                                    sendOutJSON(res, 400, error, '');
                                }
                            }
                    );
                } else {
                    if (error == "no_error") {
                        var query_exist = "select exists(select 1 from cars where plate='" + plate + "');";
                        client.query(
                                query_exist,
                                function (err, result) {
                                    console.log('getLastTrips select exist', err);
                                    //console.log(result);
                                    var is_vehicle_sharing = false;
                                    if ((typeof result !== 'undefined') && (result.rows[0].exists == true)) {
                                        is_vehicle_sharing = true;
                                    } else {
                                        outTxt = 'No car found.';
                                    }
                                    var query_running = "select true as \"is_vehicle_sharing\",manufactures as \"vehicle_manufacturer\",model as \"vehicle_model\",trips.fleet_id as \"vehicle_fleet_id\",trips.id as \"trip_id\",timestamp_beginning::text as \"trip_beginning_timestamp\",address_beginning as \"trip_beginning_address\",timestamp_end::text as \"trip_end_timestamp\",address_end as \"trip_end_address\",customer_id,customers.name as \"customer_name\",customers.surname as \"customer_surname\",customers.tax_code as \"customer_tax_code\",customers.maintainer as \"customer_is_operator\",customers.address as \"customer_address\",customers.zip_code as \"customer_zip_code\",customers.town as \"customer_town\",customers.province as \"customer_province\",customers.birth_country as \"customer_country\",customers.email as \"customer_email\",customers.driver_license as \"customer_driver_license_number\",customers.driver_license_categories as \"customer_driver_license_categories\",customers.driver_license_country as \"customer_driver_license_country\",customers.driver_license_release_date::text as \"customer_driver_license_release_date\",customers.driver_license_expire::text as \"customer_driver_license_expiration_date\",customers.driver_license_country as \"customer_driver_license_release_town\",customers.driver_license_authority as \"customer_driver_license_release_authority\",customers.birth_date::text as \"customer_birth_date\",customers.birth_town::text as \"customer_birth_town\" from trips,cars,customers where customers.id=trips.customer_id and car_plate=plate AND car_plate='" + plate + "' AND timestamp_beginning <= '" + timestamp + "'::timestamp AND timestamp_end >= '" + timestamp + "'::timestamp AND timestamp_beginning<=now() AND timestamp_end<=now() AND timestamp_beginning<=timestamp_end AND (timestamp_end - timestamp_beginning < '24:00:00') limit 1;";
                                    client.query(
                                            query_running,
                                            function (err, result_running) {
                                                if (err) {
                                                    done();
                                                    var outJson = {"is_vehicle_sharing": is_vehicle_sharing};
                                                    console.log('getLastTrips select error open trip', err);
                                                    sendOutJSON(res, 400, err, outJson);
                                                    next.ifError(err);
                                                }
                                                if ((typeof result_running !== 'undefined') && (result_running.rowCount == 1)) {
                                                    var res_run = result_running.rows[0];//inserisci il primo dato nel return
                                                } else {
                                                    var res_run = {"is_vehicle_sharing": is_vehicle_sharing};
                                                }
                                                var trip_id = 0;
                                                if (typeof res_run['trip_id'] !== 'undefined') {
                                                    trip_id = res_run['trip_id'];
                                                }
                                                var query_prec_trip = "select true as \"is_vehicle_sharing\",manufactures as \"vehicle_manufacturer\",model as \"vehicle_model\",trips.fleet_id as \"vehicle_fleet_id\",trips.id as \"trip_id\",timestamp_beginning::text as \"trip_beginning_timestamp\",address_beginning as \"trip_beginning_address\",timestamp_end::text as \"trip_end_timestamp\",address_end as \"trip_end_address\",customer_id,customers.name as \"customer_name\",customers.surname as \"customer_surname\",customers.tax_code as \"customer_tax_code\",customers.maintainer as \"customer_is_operator\",customers.address as \"customer_address\",customers.zip_code as \"customer_zip_code\",customers.town as \"customer_town\",customers.province as \"customer_province\",customers.birth_country as \"customer_country\",customers.email as \"customer_email\",customers.driver_license as \"customer_driver_license_number\",customers.driver_license_categories as \"customer_driver_license_categories\",customers.driver_license_country as \"customer_driver_license_country\",customers.driver_license_release_date::text as \"customer_driver_license_release_date\",customers.driver_license_expire::text as \"customer_driver_license_expiration_date\",customers.driver_license_country as \"customer_driver_license_release_town\",customers.driver_license_authority as \"customer_driver_license_release_authority\",customers.birth_date::text as \"customer_birth_date\",customers.birth_town::text as \"customer_birth_town\" from trips,cars,customers where customers.id=trips.customer_id and car_plate=plate and trips.id in (select id from trips where car_plate='" + plate + "' AND timestamp_beginning <= '" + timestamp + "'::timestamp AND id<>" + trip_id + " AND timestamp_beginning<=now() AND timestamp_end<=now() AND timestamp_beginning<=timestamp_end AND (timestamp_end - timestamp_beginning < '24:00:00') ORDER BY timestamp_end DESC LIMIT 1) ORDER BY timestamp_end DESC;";
                                                client.query(
                                                        query_prec_trip,
                                                        function (err, result_prec_trip) {
                                                            var outTxt = 'OK';
                                                            if (err) {
                                                                done();
                                                                console.log('getLastTrips select error last trip', err);
                                                                sendOutJSON(res, 400, err, outJson);
                                                                next.ifError(err);
                                                            } else {
                                                                if ((typeof result_prec_trip !== 'undefined') && (result_prec_trip.rowCount == 1)) {
                                                                    var res_prec_trip = result_prec_trip.rows[0];
                                                                } else {
                                                                    var res_prec_trip = {"is_vehicle_sharing": is_vehicle_sharing};
                                                                }
                                                                var query_succ_trip = "select true as \"is_vehicle_sharing\",manufactures as \"vehicle_manufacturer\",model as \"vehicle_model\",trips.fleet_id as \"vehicle_fleet_id\",trips.id as \"trip_id\",timestamp_beginning::text as \"trip_beginning_timestamp\",address_beginning as \"trip_beginning_address\",timestamp_end::text as \"trip_end_timestamp\",address_end as \"trip_end_address\",customer_id,customers.name as \"customer_name\",customers.surname as \"customer_surname\",customers.tax_code as \"customer_tax_code\",customers.maintainer as \"customer_is_operator\",customers.address as \"customer_address\",customers.zip_code as \"customer_zip_code\",customers.town as \"customer_town\",customers.province as \"customer_province\",customers.birth_country as \"customer_country\",customers.email as \"customer_email\",customers.driver_license as \"customer_driver_license_number\",customers.driver_license_categories as \"customer_driver_license_categories\",customers.driver_license_country as \"customer_driver_license_country\",customers.driver_license_release_date::text as \"customer_driver_license_release_date\",customers.driver_license_expire::text as \"customer_driver_license_expiration_date\",customers.driver_license_country as \"customer_driver_license_release_town\",customers.driver_license_authority as \"customer_driver_license_release_authority\",customers.birth_date::text as \"customer_birth_date\",customers.birth_town::text as \"customer_birth_town\" from trips,cars,customers where customers.id=trips.customer_id and car_plate=plate and trips.id in (select id from trips where car_plate='" + plate + "' AND timestamp_beginning >= '" + timestamp + "'::timestamp AND id<>" + trip_id + " AND timestamp_beginning<=now() AND timestamp_end<=now() AND timestamp_beginning<=timestamp_end AND (timestamp_end - timestamp_beginning < '24:00:00') ORDER BY timestamp_end ASC LIMIT 1) ORDER BY timestamp_end ASC;";
                                                                client.query(
                                                                        query_succ_trip,
                                                                        function (err, result_succ_trip) {
                                                                            var outTxt = 'OK';
                                                                            if (err) {
                                                                                done();
                                                                                console.log('getLastTrips select error last trip', err);
                                                                                sendOutJSON(res, 400, err, outJson);
                                                                                next.ifError(err);
                                                                            } else {
                                                                                if ((typeof result_succ_trip !== 'undefined') && (result_succ_trip.rowCount == 1)) {
                                                                                    var res_succ_trip = result_succ_trip.rows[0];
                                                                                } else {
                                                                                    res_succ_trip = {"is_vehicle_sharing": is_vehicle_sharing};
                                                                                }
                                                                                outJson = [res_run, res_prec_trip, res_succ_trip];
																				console.log('getLastTrips ok');
                                                                                sendOutJSON(res, 200, outTxt, outJson);
                                                                                done();
                                                                            }
                                                                        }
                                                                );
                                                            }
                                                        }
                                                );
                                            }
                                    );
                                }
                        );
                    } else {
                        sendOutJSON(res, 400, error, '');
                    }
                }

            });
        }
        return next();
    },
    /* PUT */
    /**
     * updates cars
     * @param  array   req  request
     * @param  array   res  response
     * @param  function next handler
     */
    putCars: function (req, res, next) {

        var outCode = 200;
        var outTxt = '';
        var outJson = null;


        if (!sanitizeInput(req, res)) {
            outCode = 400;
            outTxt = "Invalid request";
            sendOutJSON(res, 400, outTxt, outJson);
        } else
        if (typeof req.params.plate !== 'undefined' && req.params.plate != '' && typeof req.params.action !== 'undefined') {

            var plate = req.params.plate;
            var action = req.params.action;

            var user_lat = '';
            var user_lon = '';

            if (typeof req.params.user_lat !== 'undefined' && typeof req.params.user_lon !== 'undefined') {
                user_lat = req.params.user_lat;
                user_lon = req.params.user_lon;
            }

            pg.connect(conString, function (err, client, done) {

                if (err) {
                    done();
                    console.log('Errore putCars connect', err);
                    next.ifError(err);
                }

                var cmd = '';
                switch (action.toLowerCase()) {
                    case 'open' :
                        cmd = 'OPEN_TRIP';
                        break;
                    case 'close':
                        cmd = 'CLOSE_TRIP';
                        break;
                    case 'park':
                        cmd = 'PARK_TRIP';
                        break;
                    case 'unpark':
                        cmd = 'UNPARK_TRIP';
                        break;

                    default:
                        done();
                        outTxt = "Invalid action";
                        sendOutJSON(res, 400, outTxt, outJson);
                        return next();
                }

                client.query(
                        "SELECT EXISTS(SELECT plate FROM cars WHERE plate=$1)",
                        [plate],
                        function (err, result) {
                            done();
                            if (err) {
                                console.log('Errore putCars exists', err);
                                next.ifError(err);
                            }

                            if (result.rows[0].exists) {
                                if (cmd != '') {
                                    client.query("SELECT EXISTS(SELECT id FROM trips WHERE timestamp_end IS NULL AND car_plate = $1) as trip, EXISTS(SELECT plate FROM cars WHERE plate=$1 AND status!='operative') as status, EXISTS(SELECT id FROM reservations WHERE car_plate=$1 AND active=TRUE AND customer_id!=$2) as reservation", [plate, req.user.id], function (err, resultTripActive) {
                                        done();
                                        if (err) {
                                            console.log('Errore if exists trips ', err);
                                            next.ifError(err);
                                        }

                                        if (cmd == 'OPEN_TRIP' && (resultTripActive.rows[0].trip || resultTripActive.rows[0].status || resultTripActive.rows[0].reservation)) {
                                            console.log('Errore trip active exists', err);
                                            sendOutJSON(res, 400, 'Error: reservation:' + resultTripActive.rows[0].reservation + ' - status:' + resultTripActive.rows[0].status + ' - trip:' + resultTripActive.rows[0].trip, null);
                                            return next();
                                        } else {
                                            var sql = "INSERT INTO commands (car_plate, queued, to_send, command, txtarg1) values ($1, now(), true, $2 , $3 )";
                                            var params = [plate, cmd, req.user.card_code];
                                            client.query(sql,
                                                    params,
                                                    function (err, result) {
                                                        done();
                                                        if (err) {
                                                            console.log('Errore putCars insert', err);
                                                            next.ifError(err);
                                                        }

                                                        if (user_lat != '' && user_lon != '') {
                                                            var sqlLoc = "INSERT INTO customer_locations (customer_id, latitude, longitude, action, timestamp, car_plate,ip,port) values ($1,$2, $3, $4 , now(), $5 ,$6,$7)";
                                                            var paramsLoc = [req.user.id, user_lat, user_lon, action.toLowerCase() + " trip", plate,req.connection.remoteAddress,req.connection.remotePort];
                                                            client.query(sqlLoc,
                                                                    paramsLoc,
                                                                    function (err, result) {
                                                                        done();
                                                                        if (err) {
                                                                            console.log('Errore putCars insert location', err);
                                                                            next.ifError(err);
                                                                        }
                                                                    }
                                                            );
                                                        }

                                                        outTxt = "OK";
                                                        sendOutJSON(res, 200, outTxt, outJson);
                                                    }
                                            );
                                        }
                                    });
                                } else {
                                    done();
                                }
                            } else {
                                console.log('Errore getCars NOT exists', err);
                                sendOutJSON(res, 400, 'Invalid car plate', null);
                                return next();
                            }
                        }
                );
            });



        } else {
            outTxt = "Invalid parameters";
            console.error('Invalid putcars parameters', req.params);
            sendOutJSON(res, 400, outTxt, outJson);
        }
        return next();
    },
    /* PUT */
    /**
     * put new penalty safo
     * @param  array   req  request
     * @param  array   res  response
     * @param  function next handler
     */
    chargePenalty: function (req, res, next) {
        if (sanitizeInput(req, res)) {
            pg.connect(conString, function (err, client, done) {
                if (err) {
                    done();
                    console.log('chargePenalty', req.connection.remoteAddress, 'connect error', err);
                    next.ifError(err);
                }
				next();
                var d = new Date();
                var insert_ts = d.getFullYear() + "/" + ("00" + (d.getMonth() + 1)).slice(-2) + "/" + ("00" + d.getDate()).slice(-2) + " " + ("00" + d.getHours()).slice(-2) + ":" + ("00" + d.getMinutes()).slice(-2) + ":" + ("00" + d.getSeconds()).slice(-2);
                var charged = false;
                var customer_id = null;
                var vehicle_fleet_id = null;
                var violation_category = 0;
                var trip_id = null;
                var vehicle_license_plate = null;
                var violation_timestamp = "1970-01-01 00:00:00";
                var violation_authority = "no_v_authority";
                var violation_number = "no_v_number";
                var violation_description = "no_v_description";
                var rus_id = -1;
                var violation_request_type = -1;
                var violation_status = "N";
                var email_sent_timestamp = null;
                var email_sent_ok = null;
                var penalty_ok = null;
                var amount = -1;
                var complete = false;
				var extra_payment_id = null;
                var error = "no_error";
                try {
                    json_parsed = JSON.parse(req.body);
                    customer_id = json_parsed.customer_id;
                    if (isNaN(customer_id)) {
                        //error = "customer_id is not valid.";
						customer_id = null;
                    } else {
                        if (customer_id.length <= 0) {
                            //error = "customer_id is not valid.";
							customer_id = null;
                        }else{
							if (customer_id < 0) {
								error = "customer_id is not valid.";
							}
						}
                    }
					if(customer_id==0){
						customer_id=null;
					}
                    vehicle_fleet_id = json_parsed.vehicle_fleet_id;
                    if (isNaN(vehicle_fleet_id)) {
                        //error = "vehicle_fleet_id is not valid.";
						vehicle_fleet_id = null;
                    } else {
                        if (vehicle_fleet_id.length <= 0) {
                            //error = "vehicle_fleet_id is not valid.";
							vehicle_fleet_id = null;
                        }else{
							if (vehicle_fleet_id < 0) {
								error = "vehicle_fleet_id is not valid.";
							}
						}
                    }
                    violation_category = json_parsed.violation_category;
                    if (isNaN(violation_category)) {
                        error = "violation_category is not valid.";
                    } else {
                        if (violation_category.length <= 0) {
                            error = "violation_category is not valid.";
                        }
                    }
                    trip_id = json_parsed.trip_id;
                    if (isNaN(trip_id)) {
						//error = "trip_id is not valid.";
						trip_id = null;
                    } else {
                        if (trip_id.length <= 0) {
							//error = "trip_id is not valid.";
							trip_id = null;
                        }else{
							if (trip_id < 0) {
								error = "trip_id is not valid.";
							}
						}
                    }
					if(trip_id == 0){
						trip_id=null;
					}
                    vehicle_license_plate = json_parsed.vehicle_license_plate;
                    if (vehicle_license_plate === null || vehicle_license_plate === "null" || vehicle_license_plate.length < 1 || vehicle_license_plate==0) {
                        //error = "vehicle_license_plate is not valid.";
						vehicle_license_plate = null
                    } else {
                        vehicle_license_plate = vehicle_license_plate.toUpperCase();
                    }

                    try {
                        timestamp = json_parsed.violation_timestamp;
                        var test_date = new Date(timestamp);
                        timestamp = test_date.toISOString().replace(/T/, ' ').replace(/\..+/, '');

                        if ((typeof timestamp !== 'undefined')) {
                            if (timestamp.length <= 0) {
                                error = "violation_timestamp is not valid";
                            }
                        } else {
                            error = "violation_timestamp is not valid";
                        }
                    } catch (err) {
                        error = "violation_timestamp is not valid";
                    }
                    if (error != "violation_timestamp is not valid") {
                        violation_timestamp = json_parsed.violation_timestamp;
                    }

                    violation_authority = json_parsed.violation_authority;
                    if (violation_authority === null || violation_authority === "null" || violation_authority.length < 1) {
                        error = "violation_authority is not valid.";
                    }
                    violation_number = json_parsed.violation_number;
                    if (violation_number === null || violation_number === "null" || violation_number.length < 1) {
                        error = "violation_number is not valid.";
                    }
                    violation_description = json_parsed.violation_description;
                    if (violation_description === null || violation_description === "null") {
                        error = "violation_description is not valid.";
                    }
                    rus_id = json_parsed.rus_id;
                    if (isNaN(rus_id)) {
                        error = "rus_id is not valid.";
                    }
                    violation_request_type = json_parsed.violation_request_type;
                    if (isNaN(violation_request_type)) {
                        error = "violation_request_type is not valid.";
                    }
                    violation_status = json_parsed.violation_status;
                    if (violation_status === null || violation_status === "null" || violation_status.length < 1 || violation_status.length > 1) {
                        error = "violation_status is not valid.";
                    }

                    if ((json_parsed.email_sent_timestamp !== null) && (violation_description !== "null")){
						try {
							timestamp = json_parsed.email_sent_timestamp;
							var test_date = new Date(timestamp);
							email_sent_timestamp = test_date.toISOString().replace(/T/, ' ').replace(/\..+/, '');

							if ((typeof email_sent_timestamp !== 'undefined')) {
								if (email_sent_timestamp.length <= 0) {
									//isempty
								}
							} else {
								//isempty
							}
						} catch (err) {
							//isempty
						}
						if (email_sent_timestamp !== null) {
							email_sent_timestamp = new Date(json_parsed.email_sent_timestamp);
						}
                    }
					
                    if ((typeof json_parsed.email_sent_ok !== 'undefined')) {
                        email_sent_ok = json_parsed.email_sent_ok;
                    } else {
                        email_sent_ok = null;
                    }

                    if ((typeof json_parsed.penalty_ok !== 'undefined')) {
                        penalty_ok = json_parsed.penalty_ok;
                    } else {
                        penalty_ok = null;
                    }

					if ((typeof json_parsed.amount !== 'undefined')) {
                        amount = json_parsed.amount;
						if (isNaN(amount)) {
							error = "amount is not valid.";
						} else {
							if (amount < 0) {
								error = "amount is not valid.";
							}
						}
                    } else {
						error = "amount is not valid.";
                    }

					if ((typeof json_parsed.complete !== 'undefined')) {
						if(typeof(json_parsed.complete) === "boolean"){
							complete = json_parsed.complete;
						}else{
							error = "complete is not valid.";
						}
                    } else {
                        error = "complete is not valid.";
                    }

                } catch (err) {
                    error = "JSON is not valid";
                }
                var outJson = {"penalty_loading_result": "false"};
                if (error == "no_error") {
                    //inizio check coerenza
					
                    var query_coherent = "SELECT EXISTS(SELECT 1 FROM cars WHERE plate = $1) as plate_exist, EXISTS(SELECT 1 FROM customers WHERE id = $2) as customer_exist, EXISTS(SELECT 1 FROM trips WHERE id = $3) as trip_exist, EXISTS(SELECT 1 FROM trips WHERE id = $4 AND customer_id = $5) as trip_coherent, (SELECT id FROM safo_penalty where rus_id=$6 order by id desc limit 1) as penalty_exist, (SELECT id FROM safo_penalty where rus_id=$7 AND extra_payment_id IS NULL order by id desc limit 1) as penalty_not_payed;";
                    client.query(
                            query_coherent,
							[vehicle_license_plate,
							customer_id,
							trip_id,
							trip_id,
							customer_id,
							rus_id,
							rus_id],
                            function (err_co, result_co) {
                                if (err_co) {
                                    console.log('chargePenalty', req.connection.remoteAddress, 'coherent check query error', err_co);
                                    sendOutJSON(res, 400, "KO", outJson);
                                    next.ifError(err_co);
                                } else {
                                    if ((typeof result_co !== 'undefined')) {
                                        var err_co = "no error";
										var penalty_exist = 0;
                                        console.log(result_co.rows[0]);
                                        if ((!result_co.rows[0]['trip_coherent'])&&(trip_id>0)&&(customer_id>0)) {
                                            err_co = "trip is not coherent";
                                        }
                                        if ((!result_co.rows[0]['trip_exist'])&&(trip_id>0)) {
                                            err_co = "trip does not exist";
                                        }
                                        if ((!result_co.rows[0]['plate_exist'])&&(vehicle_license_plate!="no_plate")) {
                                            //err_co = "plate does not exist";
											vehicle_license_plate = null;
                                        }
                                        if ((!result_co.rows[0]['customer_exist'])&&(customer_id>0)) {
                                            err_co = "customer does not exist";
                                        }
										/*
										if (!result_co.rows[0]['penalty_not_payed']) {
                                            err_co = "fine not editable, already assigned";
                                        }
										*/
										if (!result_co.rows[0]['penalty_exist']) {
											penalty_exist = 0;
										} else {
											penalty_exist = result_co.rows[0]['penalty_exist'];
										}

                                        if (err_co == "no error"){
											var payable = true;
											//check if fine is not payable (our fault)
											if(violation_description=="Il proprietario del veicolo deve comunicare entro 60gg dalla richiesta, all'organo di polizia, i dati personali e della patente del conducente al momento della commessa violazione."){
												payable = false;
											}
											if (penalty_exist > 0){
												if (!result_co.rows[0]['penalty_not_payed']) {
													err_co = "fine not editable, already assigned";
													outJson = {"penalty_loading_result": "false", "error": err_co};
													console.log('chargePenalty', req.connection.remoteAddress, 'coherent check error', err_co);
													sendOutJSON(res, 400, "KO", outJson);
													done();
												}
												//inizio update
												var query = "UPDATE safo_penalty SET insert_ts=$1, charged=$2, customer_id=$3, vehicle_fleet_id=$4, violation_category=$5, trip_id=$6, car_plate=$7, violation_timestamp=$8, violation_authority=$9, violation_number=$10, violation_description=$11, rus_id=$12, violation_request_type=$13, violation_status=$14, email_sent_timestamp=$15, email_sent_ok=$16, penalty_ok=$17, amount=$18, complete=$19, payable=$20 WHERE id=$21;";
												client.query(
													query,
													[insert_ts,
													charged,
													customer_id,
													vehicle_fleet_id,
													violation_category,
													trip_id,
													vehicle_license_plate,
													new Date(violation_timestamp),
													violation_authority,
													violation_number,
													violation_description,
													rus_id,
													violation_request_type,
													violation_status,
													email_sent_timestamp,
													email_sent_ok,
													penalty_ok,
													amount,
													complete,
													payable,
													penalty_exist],
													function (err, result) {
														if (err) {
															console.log('chargePenalty', req.connection.remoteAddress, 'update error', err);
															sendOutJSON(res, 400, "KO", outJson);
															next.ifError(err);
														} else {
															if ((typeof result !== 'undefined')) {
																outJson = {"penalty_loading_result": "true"};
															} else {
																outJson = {"penalty_loading_result": "false"};
															}
															console.log('chargePenalty', req.connection.remoteAddress, 'update ok', customer_id, vehicle_license_plate);
															sendOutJSON(res, 200, "OK", outJson);
															done();
														}
													}
												);
												//fine update
											} else {
												//inizio insert
												var query = "INSERT INTO safo_penalty (\"id\",\"insert_ts\",\"charged\",\"consumed_ts\",\"customer_id\",\"vehicle_fleet_id\",\"violation_category\",\"trip_id\",\"car_plate\",\"violation_timestamp\",\"violation_authority\",\"violation_number\",\"violation_description\",\"rus_id\",\"violation_request_type\",\"violation_status\",\"email_sent_timestamp\",\"email_sent_ok\",\"penalty_ok\",\"amount\",\"complete\",\"extra_payment_id\",\"payable\") VALUES (nextval('safo_penalty_id_seq'::regclass),$1,$2,NULL,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,NULL,$20);";
												client.query(
													query,
													[insert_ts,
													charged,
													customer_id,
													vehicle_fleet_id,
													violation_category,
													trip_id,
													vehicle_license_plate,
													new Date(violation_timestamp),
													violation_authority,
													violation_number,
													violation_description,
													rus_id,
													violation_request_type,
													violation_status,
													new Date(email_sent_timestamp),
													email_sent_ok,
													penalty_ok,
													amount,
													complete,
													payable],
													function (err, result) {
														if (err) {
															console.log('chargePenalty', req.connection.remoteAddress, 'insert error', err);
															sendOutJSON(res, 400, "KO", outJson);
															next.ifError(err);
														} else {
															if ((typeof result !== 'undefined')) {
																outJson = {"penalty_loading_result": "true"};
															} else {
																outJson = {"penalty_loading_result": "false"};
															}
															console.log('chargePenalty', req.connection.remoteAddress, 'insert ok', customer_id, vehicle_license_plate);
															sendOutJSON(res, 200, "OK", outJson);
															done();
														}
													}
												);
												//fine insert
											}
                                        } else {
                                            outJson = {"penalty_loading_result": "false", "error": err_co};
                                            console.log('chargePenalty', req.connection.remoteAddress, 'coherent check error', err_co);
                                            sendOutJSON(res, 400, "KO", outJson);
                                            done();
                                        }
                                    } else {
                                        console.log('chargePenalty', req.connection.remoteAddress, 'qr err');
                                        outJson = {"penalty_loading_result": "false"};
                                        sendOutJSON(res, 400, "KO", outJson);
                                        done();
                                    }
                                }
                            }
                    );
                    //fine check coerenza
                } else {
                    console.log('chargePenalty', req.connection.remoteAddress, 'JSON is not valid');
                    sendOutJSON(res, 400, error, {"penalty_loading_result": "false","error":"JSON is not valid"});
                    done();
                }

            });
        }
        //return next();
    },
    /* PUT */
    /**
     * get reservation details
     * @param  array   req  request
     * @param  array   res  response
     * @param  function next handler
     */
    getReservations: function (req, res, next) {
        if (sanitizeInput(req, res)) {
            pg.connect(conString, function (err, client, done) {

                if (err) {
                    done();
                    console.log('Errore getReservations connect', err);
                    next.ifError(err);
                }

                var params = [], nparam, reservationQuery = '', isSingle = false;

                if (typeof req.params.reservation !== 'undefined') {
                    reservationQuery = ' AND id = $2';
                    params[0] = req.user.id;
                    params[1] = req.params.reservation;
                    isSingle = true;
                    nparam = 2;
                } else {
                    reservationQuery = '';
                    params[0] = req.user.id;
                    nparam = 1;
                }

                if (typeof req.params.active !== 'undefined') {
                    if (req.params.active == 'true') {
                        reservationQuery += ' AND active IS TRUE';
                    } else {
                        reservationQuery += ' AND active IS FALSE';
                    }
                } else {
                    reservationQuery += ' AND active IS TRUE';
                }


                if (typeof req.params.from !== 'undefined') {
                    reservationQuery += ' AND cast(extract(epoch from ts) as integer) >= $' + (nparam + 1);
                    params[nparam] = req.params.from;
                    nparam++;
                }

                if (typeof req.params.to !== 'undefined') {
                    reservationQuery += ' AND cast(extract(epoch from ts) as integer) <= $' + (nparam + 1);
                    params[nparam] = req.params.to;
                    nparam++;
                }



                reservationQuery += ' ORDER BY ts DESC';

                if (typeof req.params.quantity !== 'undefined') {
                    reservationQuery += ' LIMIT $' + (nparam + 1);
                    params[nparam] = req.params.quantity;
                    nparam++;
                }

                client.query(
                        "SELECT id,extract(epoch from ts::timestamp with time zone)::integer as reservation_timestamp,extract(epoch from beginning_ts::timestamp with time zone)::integer as timestamp_start,active as is_active, car_plate, length FROM reservations WHERE customer_id = $1 " + reservationQuery,
                        params,
                        function (err, result) {
                            done();
                            if (err) {
                                console.log('Errore getReservations select', err);
                                next.ifError(err);
                            }
                            var outTxt = '', outJson = null;
                            console.log('getReservations select done', err);
                            if ((typeof result !== 'undefined') && (result.rowCount > 0)) {
                                outJson = !isSingle ? result.rows : result.rows[0];
                            } else {
                                outTxt = 'No reservation found';
                            }
                            sendOutJSON(res, 200, outTxt, outJson);

                        }
                );
            });
        }
        return next();
    },
    /**
     * get trip details
     * @param  array   req  request
     * @param  array   res  response
     * @param  function next handler
     */
    getTrips: function (req, res, next) {
        if (sanitizeInput(req, res)) {
            pg.connect(conString, function (err, client, done) {

                if (err) {
                    done();
                    console.log('Errore getTrips ', err);
                    next.ifError(err);
                }

                var query = '', queryJoin = '', queryFrom = '', params = [], nparam, queryTrip = '', isSingle = false;

                if (req.path() == '/v2/trips/current') {
                    params[0] = req.user.id;
                    nparam = 1;
                    queryTrip += ' AND timestamp_end IS NULL LIMIT 1';
                    queryJoin += ' INNER JOIN cars on trips.car_plate = cars.plate ';
                    queryFrom += ',parking,park_enabled';
                    console.log('trips / current ', queryTrip);

                } else {

                    if (typeof req.params.id === 'undefined') {
                        queryTrip = "";
                        params[0] = req.user.id;
                        nparam = 1;
                    } else {
                        queryTrip = " AND id = $2";
                        params[0] = req.user.id;
                        params[1] = req.params.id;
                        nparam = 2;
                        isSingle = true;
                    }

                    if (typeof req.params.active !== 'undefined') {
                        if (req.params.active == 'true') {
                            queryTrip += ' AND timestamp_end IS NULL';
                        } else {
                            queryTrip += ' AND timestamp_end IS NOT NULL ';
                        }
                    } else {
                        queryTrip += ' AND timestamp_end IS NULL ';
                    }

                    if (typeof req.params.from !== 'undefined') {
                        queryTrip += ' AND cast(extract(epoch from timestamp_beginning) as integer) >= $' + (nparam + 1);
                        params[nparam] = req.params.from;
                        nparam++;
                    }

                    if (typeof req.params.to !== 'undefined') {
                        queryTrip += ' AND cast(extract(epoch from timestamp_beginning) as integer) <= $' + (nparam + 1);
                        params[nparam] = req.params.to;
                        nparam++;
                    }

                    queryTrip += ' ORDER BY timestamp_beginning DESC';

                    if (typeof req.params.quantity !== 'undefined') {
                        queryTrip += ' LIMIT $' + (nparam + 1);
                        params[nparam] = req.params.quantity;
                        nparam++;
                    }
                }


                client.query(
                        "SELECT id,car_plate,extract(epoch from timestamp_beginning::timestamp with time zone)::integer as timestamp_start, extract(epoch from timestamp_end::timestamp with time zone)::integer as timestamp_end,km_beginning as km_start,km_end,latitude_beginning as lat_start,latitude_end as lat_end,longitude_beginning as lon_start,longitude_end as lon_end,park_seconds" + queryFrom + " FROM trips " + queryJoin + " WHERE customer_id = $1 " + queryTrip,
                        params,
                        function (err, result) {
                            done();
                            if (err) {
                                console.log('Errore getTrips select', err);
                                sendOutJSON(res, 400, err, outJson);
                                next.ifError(err);
                            }
                            console.log('getTrips select ', err);
                            var outTxt = '', outJson = null;
                            if ((typeof result !== 'undefined') && (result.rowCount > 0)) {
                                outJson = !isSingle ? result.rows : result.rows[0];
                            } else {
                                outTxt = 'No trips found';
                            }
                            sendOutJSON(res, 200, outTxt, outJson);
                        }
                );
            });
        }
        return next();
    },
    getTripsNew: function (req, res, next) {
        if (sanitizeInput(req, res)) {
            pg.connect(conString, function (err, client, done) {

                if (err) {
                    done();
                    console.log('Errore getTrips ', err);
                    next.ifError(err);
                }

                var query = '', queryJoin = '', queryFrom = '', params = [], nparam, queryTrip = '', isSingle = false;

                queryJoin += ' LEFT JOIN trip_payments on trips.id = trip_payments.trip_id  ';
                if (req.path() == '/v2/trips/current') {
                    params[0] = req.user.id;
                    nparam = 1;
                    queryTrip += ' AND timestamp_end IS NULL LIMIT 1';
                    queryJoin += ' LEFT JOIN trip_payments on trips.id = trip_payments.trip_id  ';
                    //queryFrom += ',parking,park_enabled';
                    console.log('trips / current ', queryTrip);

                } else {


                    if (typeof req.params.id === 'undefined') {
                        queryTrip = "";
                        params[0] = req.user.id;
                        nparam = 1;
                    } else {
                        queryTrip = " AND trips.id = $2";
                        params[0] = req.user.id;
                        params[1] = req.params.id;
                        nparam = 2;
                        isSingle = true;
                    }

                    if (typeof req.params.active !== 'undefined') {
                        if (req.params.active == 'true') {
                            queryTrip += ' AND timestamp_end IS NULL';
                        } else {
                            queryTrip += ' AND timestamp_end IS NOT NULL ';
                        }
                    } else {
                        if (typeof req.params.id === 'undefined') {
                            queryTrip += ' AND timestamp_end IS NULL ';
                        }
                    }

                    if (typeof req.params.from !== 'undefined') {
                        queryTrip += ' AND cast(extract(epoch from timestamp_beginning) as integer) >= $' + (nparam + 1);
                        params[nparam] = req.params.from;
                        nparam++;
                    }

                    if (typeof req.params.to !== 'undefined') {
                        queryTrip += ' AND cast(extract(epoch from timestamp_beginning) as integer) <= $' + (nparam + 1);
                        params[nparam] = req.params.to;
                        nparam++;
                    }

                    queryTrip += ' ORDER BY timestamp_beginning DESC';

                    if (typeof req.params.quantity !== 'undefined') {
                        queryTrip += ' LIMIT $' + (nparam + 1);
                        params[nparam] = req.params.quantity;
                        nparam++;
                    }
                }

                //query="SELECT trips.id,trips.car_plate,extract(epoch from trips.timestamp_beginning::timestamp with time zone)::integer as timestamp_start, extract(epoch from trips.timestamp_end::timestamp with time zone)::integer as timestamp_end,trips.latitude_beginning as lat_start,trips.latitude_end as lat_end,trips.longitude_beginning as lon_start,trips.longitude_end as lon_end,trips.park_seconds, trip_payments.parking_minutes,trip_payments.total_cost, trip_payments.payed_successfully_at , trip_payments.status, trips.payable, trips.is_accounted FROM trips "+queryJoin+" WHERE customer_id = $1 "+queryTrip;
                client.query(
                        "SELECT trips.id,trips.car_plate,extract(epoch from trips.timestamp_beginning::timestamp with time zone)::bigint as timestamp_start, extract(epoch from trips.timestamp_end::timestamp with time zone)::bigint as timestamp_end,trips.latitude_beginning as lat_start,trips.latitude_end as lat_end,trips.longitude_beginning as lon_start,trips.longitude_end as lon_end,trips.park_seconds, trip_payments.parking_minutes,trip_payments.total_cost, trip_payments.payed_successfully_at , trip_payments.status, trips.payable, trips.cost_computed FROM trips " + queryJoin + " WHERE customer_id = $1 " + queryTrip,
                        params,
                        function (err, result) {
                            done();
                            if (err) {
                                console.log('Errore getTrips select', err);
                                sendOutJSON(res, 400, err + req.user.id, outJson);
                                next.ifError(err);
                            }
                            console.log('getTrips select ', err);
                            var outTxt = '', outJson = null;
                            if ((typeof result !== 'undefined') && (result.rowCount > 0)) {
                                outJson = !isSingle ? result.rows : result.rows[0];
                            } else {
                                outTxt = 'No trips found';
                            }
                            sendOutJSON(res, 200, outTxt, outJson);
                        }
                );
            });
        }
        return next();
    },
    /**
     * get pois
     * @param  array   req  request
     * @param  array   res  response
     * @param  function next handler
     */
    getPois: function (req, res, next) {
        if (sanitizeInput(req, res)) {
            pg.connect(conString, function (err, client, done) {

                if (err) {
                    done();
                    console.log('Errore getPois connect', err);
                    next.ifError(err);
                }

                var query = '', params = [], queryString = '', isSingle = false;

                query = "SELECT * FROM pois WHERE true"


                client.query(
                        query,
                        params,
                        function (err, result) {
                            done();
                            if (err) {
                                console.log('Errore getPois select', err);
                                next.ifError(err);
                            }
                            var outTxt = '', outJson = null;
                            console.log('getPois select', err);
                            if ((typeof result !== 'undefined') && (result.rowCount > 0)) {
                                outJson = !isSingle ? result.rows : result.rows[0];
                            } else {
                                outTxt = 'No pois found';
                            }
                            sendOutJSON(res, 200, outTxt, outJson);
                        }
                );
            });
        }
        return next();
    },
    /**
     * get reservations archive
     * @param  array   req  request
     * @param  array   res  response
     * @param  function next handler
     */
    getArchiveReservations: function (req, res, next) {
        if (sanitizeInput(req, res)) {
            pg.connect(conString, function (err, client, done) {

                if (err) {
                    done();
                    console.log('Errore getArchiveReservations connect', err);
                    next.ifError(err);
                }

                client.query(
                        "SELECT * FROM reservations_archive WHERE customer_id = $1",
                        [req.user.id],
                        function (err, result) {
                            done();
                            if (err) {
                                console.log('Errore getArchiveReservations select', err);
                                next.ifError(err);
                            }
                            var outTxt = '', outJson = null;
                            console.log('getArchiveReservations select', err);
                            if ((typeof result !== 'undefined') && (result.rowCount > 0)) {
                                outJson = result.rows;
                            } else {
                                outTxt = 'No reservations in archive found';
                            }
                            sendOutJSON(res, 200, outTxt, outJson);
                        }
                );
            });
        }
        return next();
    },

    /**
     * get configuration archive
     * @param  array   req  request
     * @param  array   res  response
     * @param  function next handler
     */
    getConfig: function (req, res, next) {
        if (sanitizeInput(req, res)) {
            pg.connect(conString, function (err, client, done) {

                if (err) {
                    done();
                    console.log('Errore getConfig connect', err);
                    next.ifError(err);
                }

                client.query(
                    "SELECT config_key,config_value FROM configurations WHERE slug = 'app'",
                    function (err, result) {
                        done();
                        if (err) {
                            console.log('Errore getConfig select', err);
                            next.ifError(err);
                        }
                        var outTxt = '', outJson = null;
                        console.log('getConfig select', err);
                        if ((typeof result !== 'undefined') && (result.rowCount > 0)) {
                            outJson = result.rows;
                        } else {
                            outTxt = 'No getConfig in archive found';
                        }
                        sendOutJSON(res, 200, outTxt, outJson);
                    }
                );
            });
        }
        return next();
    },
    /* / GET */

    /* POST */

    /**
     * add a reservation
     * @param  array   req  request
     * @param  array   res  response
     * @param  function next handler
     */

    /**
     * TODO
     * values for ts, beginning_ts, length, to_send?
     * add freeCarCond ?
     */

    postReservations: function (req, res, next) {
        if (sanitizeInput(req, res)) {
            pg.connect(conString, function (err, client, done) {

                if (err) {
                    done();
                    console.log('Errore postReservations connect ', err);
                    next.ifError(err);
                }

                if (typeof req.params.plate !== 'undefined' && req.params.plate != '') {

                    var user_lat = '';
                    var user_lon = '';

                    if (typeof req.params.user_lat !== 'undefined' && typeof req.params.user_lon !== 'undefined') {
                        user_lat = req.params.user_lat;
                        user_lon = req.params.user_lon;
                    }

                    client.query(
                            "SELECT EXISTS(SELECT plate FROM cars WHERE plate=$1)",
                            [req.params.plate],
                            function (err, result) {
                                done();
                                if (err) {
                                    console.log('Errore postReservations exits car', err);
                                    next.ifError(err);
                                }
                                if (result.rows[0].exists) {
                                    client.query(
                                            "SELECT EXISTS(SELECT id FROM trips WHERE car_plate = $2 AND customer_id = $1 AND payable = TRUE AND timestamp_beginning >= (SELECT consumed_ts FROM (SELECT (consumed_ts - interval '180 second') as consumed_ts FROM (SELECT consumed_ts FROM reservations WHERE car_plate=$2 AND customer_id=$1 AND ts >= (now() - interval '4' hour) UNION SELECT consumed_ts FROM reservations_archive WHERE car_plate=$2 AND customer_id=$1 AND ts >= (now() - interval '4' hour)) AS reservation ORDER BY consumed_ts DESC LIMIT 1) as reservation WHERE consumed_ts IS NOT NULL) AND timestamp_beginning <= (SELECT consumed_ts FROM (SELECT (consumed_ts + interval '180 second') as consumed_ts FROM (SELECT consumed_ts FROM reservations WHERE car_plate=$2 AND customer_id=$1 AND ts >= (now() - interval '4' hour) UNION SELECT consumed_ts FROM reservations_archive WHERE car_plate=$2 AND customer_id=$1 AND ts >= (now() - interval '4' hour)) AS reservation ORDER BY consumed_ts DESC LIMIT 1) as reservation WHERE consumed_ts IS NOT NULL) AND timestamp_end IS NOT NULL AND (timestamp_end - timestamp_beginning) > '00:02:00') as trips",
                                            [req.user.id, req.params.plate],
                                            function (err, result) {
                                                done();
                                                if (err) {
                                                    console.log('Errore postReservations exists trips ', err);
                                                    next.ifError(err);
                                                }
                                                if (result.rows[0].trips) {
                                                    var limit = false;
                                                    var limit_archive = false;
                                                    var queryLimit = "";
                                                } else {
                                                    var queryLimit = ", EXISTS(SELECT car_plate FROM reservations WHERE car_plate=$2 AND customer_id=$1 AND ts >= (now() - interval '4' hour)) as limit, EXISTS(SELECT car_plate FROM reservations_archive WHERE car_plate=$2 AND customer_id=$1 AND ts >= (now() - interval '4' hour)) as limit_archive";
                                                }
                                                client.query(
                                                        "SELECT EXISTS(SELECT car_plate FROM reservations WHERE (customer_id=$1 OR car_plate=$2) AND active IS TRUE)as reservation, EXISTS(SELECT plate FROM cars WHERE plate=$2 AND status!='operative') as status, EXISTS(SELECT id FROM trips WHERE timestamp_end IS NULL AND car_plate=$2) as trip" + queryLimit,
                                                        [req.user.id, req.params.plate],
                                                        function (err, result) {
                                                            done();
                                                            if (err) {
                                                                console.log('Errore postReservations exists reservation ', err);
                                                                next.ifError(err);
                                                            }
                                                            console.log('postReservations select ', err);
                                                            if (!result.rows[0].trips) {
                                                                var limit = result.rows[0].limit;
                                                                var limit_archive = result.rows[0].limit_archive;
                                                            }
                                                            if (result.rows[0].reservation || result.rows[0].status || result.rows[0].trip || limit || limit_archive) {
                                                                sendOutJSON(res, 200, 'Error: reservation:' + result.rows[0].reservation + ' - status:' + result.rows[0].status + ' - trip:' + result.rows[0].trip + ' - limit:' + limit + ' - limit_archive:' + limit_archive, null);
                                                            } else {
                                                                var cards = JSON.stringify([req.user.card_code]);
                                                                console.error(cards);
                                                                client.query(
                                                                        "INSERT INTO reservations (ts,car_plate,customer_id,beginning_ts,active,length,to_send,cards) VALUES (NOW(),$1,$2,NOW(),true,1200,true,$3) RETURNING id",
                                                                        [req.params.plate, req.user.id, cards],
                                                                        function (err, result) {
                                                                            done();
                                                                            if (err) {
                                                                                console.log('Errore getPois insert ', err);
                                                                                next.ifError(err);
                                                                            }

                                                                            if (user_lat != '' && user_lon != '') {
                                                                                var sqlLoc = "INSERT INTO customer_locations (customer_id, latitude, longitude, action, timestamp, car_plate,ip,port) values ($1,$2, $3, $4 , now(), $5 ,$6,$7)";
                                                                                var paramsLoc = [req.user.id, user_lat, user_lon, "create reservation", req.params.plate,req.connection.remoteAddress,req.connection.remotePort];
                                                                                client.query(sqlLoc,
                                                                                        paramsLoc,
                                                                                        function (err, result) {
                                                                                            done();
                                                                                            if (err) {
                                                                                                console.log('Errore postReservations insert location', err);
                                                                                                next.ifError(err);
                                                                                            }
                                                                                        }
                                                                                );
                                                                            }

                                                                            console.log('postReservations insert ', err);
                                                                            sendOutJSON(res, 200, 'Reservation created successfully', {'reservation_id': result.rows[0].id});

                                                                        }
                                                                );
                                                            }
                                                        });
                                            }
                                    );
                                } else {
                                    console.log('Errore postReservations car NOT exists ', err);
                                    sendOutJSON(res, 400, 'Invalid car plate', null);
                                }

                            }
                    );
                } else {
                    console.log('Errore postReservations invalid parameters ', err);
                    sendOutJSON(res, 400, 'Invalid parameter', null);
                }
            });
        }
        return next();
    },
    /* / POST */



    /**
     * get user point
     * @param  array   req  request
     * @param  array   res  response
     * @param  function next handler
     */
    postPoint: function (req, res, next) {
        if (sanitizeInput(req, res)) {

            var outCode = 200;
            var outTxt = '';
            var outJson = null;

            if (!sanitizeInput(req, res)) {
                outCode = 400;
                outTxt = "Invalid request";
                sendOutJSON(res, 400, outTxt, outJson);
            } else {

                //if(typeof  req.params.customerId !== 'undefined'){
                //	var customerId = req.params.customerId;

                if (typeof req.user.id !== 'undefined') {
                    var customerId = req.user.id;


                    pg.connect(conString, function (err, client, done) {

                        if (err) {
                            done();
                            console.log('Errore getPoint connect', err);
                            next.ifError(err);
                        }

                        client.query(
                                //"SELECT EXISTS(SELECT sum(total) as total,sum((CASE((valid_From is Null OR Valid_From <= now())AND(valid_to is Null OR Valid_to >= now())) WHEN 'TRUE' THEN (CASE ((insert_ts >= '2017-08-01' AND insert_ts <= '2017-08-31'))WHEN 'TRUE' THEN total  END)END)) as pointsCurrentTime from customers_points where customer_id = $1)",
                                "SELECT sum(total) as totalPoint,sum((CASE ((valid_From is Null OR Valid_From <= now())AND(valid_to is Null OR Valid_to >= now())) WHEN 'TRUE' THEN (CASE ((insert_ts >= cast(date_trunc('month', now()) as date) AND insert_ts <= cast(date_trunc('month', now()) as date) + interval '1 month' * 1))WHEN 'TRUE' THEN total  END)END)) as pointCurrentMounth from customers_points where customer_id = $1",
                                [req.user.id],
                                function (err, result) {
                                    done();
                                    if (err) {
                                        console.log('Errore if exists customers_points', err);
                                        next.ifError(err);
                                    }

                                    if (result.rowCount > 0) {

                                        if ((typeof result !== 'undefined') && (result.rowCount > 0)) {
                                            outTxt = "OK";
                                            outJson = result.rows[0];
                                        } else {
                                            outTxt = 'No point found';
                                        }

                                        sendOutJSON(res, 200, outTxt, outJson);
                                    } else {
                                        console.log('Errore getPoint no points', err);
                                        sendOutJSON(res, 400, 'Invalid ...code', null);
                                        return next();
                                    }
                                }
                        );//end client.query

                    });//end pg.connect


                } else {
                    outTxt = "Invalid parameters";
                    console.error('Invalid putcars parameters', req.params);
                    sendOutJSON(res, 400, outTxt, outJson);
                }
            }
        }

        return next();

    }, //end getPoint


    /* DELETE */
    /**
     * delete a reservation
     * @param  array   req  request
     * @param  array   res  response
     * @param  function next handler
     */
    delReservations: function (req, res, next) {
        if (sanitizeInput(req, res)) {
            pg.connect(conString, function (err, client, done) {

                if (err) {
                    done();
                    console.log('Errore delReservations connect ', err);
                    next.ifError(err);
                }


                if (typeof req.params.id !== 'undefined') {
                    var user_lat = '';
                    var user_lon = '';

                    if (typeof req.params.user_lat !== 'undefined' && typeof req.params.user_lon !== 'undefined') {
                        user_lat = req.params.user_lat;
                        user_lon = req.params.user_lon;
                    }
                    client.query(
                            "UPDATE reservations SET active = FALSE, to_send = TRUE, deleted_ts = NOW()  WHERE id = $1 AND customer_id = $2 RETURNING car_plate",
                            [req.params.id, req.user.id],
                            function (err, result) {
                                done();
                                if (err) {
                                    console.log('Errore delReservations delete', err);
                                    next.ifError(err);
                                }
                                if (user_lat != '' && user_lon != '') {
                                    var sqlLoc = "INSERT INTO customer_locations (customer_id, latitude, longitude, action, timestamp, car_plate,ip,port) values ($1,$2, $3, $4 , now(), $5 ,$6,$7)";
                                    var plate = '';
                                    if (typeof result.rows[0].car_plate !== 'undefined' && result.rows[0].car_plate != '') {
                                        plate = result.rows[0].car_plate;
                                    }
                                    var paramsLoc = [req.user.id, user_lat, user_lon, "delete reservation ", plate,req.connection.remoteAddress,req.connection.remotePort];
                                    client.query(sqlLoc,
                                            paramsLoc,
                                            function (err, result) {
                                                done();
                                                if (err) {
                                                    console.log('Errore delReservations insert location', err);
                                                    next.ifError(err);
                                                }
                                            }
                                    );
                                }

                                console.log('delReservations delete ', err);
                                sendOutJSON(res, 200, 'Reservation ' + req.params.id + ' deleted successfully', null);
                            }
                    );
                }
            });
        }
        return next();
    },
    /* / DELETE */

    /* PUT */
    /**
     * updates trip
     * @param  array   req  request
     * @param  array   res  response
     * @param  function next handler
     */
    putTrips: function (req, res, next) {
        if (sanitizeInput(req, res)) {
            res.send(req.params);
        }
        return next();
    },
    /* / PUT */
}


/* EXTRA FUNCTIONS */
/**
 * outputs json response
 * @param  array   req  request
 * @param  array   res  response
 * @param  string reason
 * @param  array data   data to send
 */
function sendOutJSON(res, status, reason, data) {
    res.send(status, {
        'status': status,
        'reason': reason,
        'data': data,
        'time': Date.now() / 1000 | 0,
    });
}



/**
 * console log request
 * @param  req request
 */
function logReq(req) {
    console.log(
            "====================\n",
            Date.now(),
            "\n--------------------\n",
            req.query,
            "\n--------------------\n",
            req.headers,
            "\n--------------------\n",
            req.params,
            "\n\n"
            );
}

/**
 * sanitize request data
 * @param  req reques
 * @return bool, true ok, false error
 */
function sanitizeInput(req, res) {
    logReq(req);

    if ((
            (typeof req.params.plate != 'undefined') &&
            (req.params.plate != '') &&
            (
                    (!validator.isAlphanumeric(req.params.plate)) ||
                    (!validator.isByteLength(req.params.plate, 5, 9))
                    )
            ) ||
            (
                    (typeof req.params.status != 'undefined') &&
                    (req.params.status != '') &&
                    (!validator.isAlphanumeric(req.params.status))
                    ) ||
            (
                    (typeof req.params.lat != 'undefined') &&
                    (req.params.lat != '') &&
                    (!validator.isFloat(req.params.lat))
                    ) ||
            (
                    (typeof req.params.lon != 'undefined') &&
                    (req.params.lon != '') &&
                    (!validator.isFloat(req.params.lon))
                    ) ||
            (
                    (typeof req.params.radius != 'undefined') &&
                    (req.params.radius != '') &&
                    (!validator.isInt(req.params.radius))
                    ) ||
            (
                    (typeof req.params.reservation != 'undefined') &&
                    (req.params.reservation != '') &&
                    (!validator.isInt(req.params.reservation))
                    ) ||
            (
                    (typeof req.params.id != 'undefined') &&
                    (req.params.id != '') &&
                    (!validator.isInt(req.params.id)) &&
                    (req.params.id != 'current')
                    ) ||
            (
                    (typeof req.params.active != 'undefined') &&
                    (req.params.active != '') &&
                    (!validator.isBoolean(req.params.active))
                    ) ||
            (
                    (typeof req.params.quantity != 'undefined') &&
                    (req.params.quantity != '') &&
                    (!validator.isInt(req.params.quantity))
                    ) ||
            (
                    (typeof req.params.from != 'undefined') &&
                    (req.params.from != '') &&
                    (!validator.isInt(req.params.from))
                    ) ||
            (
                    (typeof req.params.to != 'undefined') &&
                    (req.params.to != '') &&
                    (!validator.isInt(req.params.to))
                    ) ||
            (
                    (typeof req.params.action != 'undefined') &&
                    (req.params.action != '') &&
                    (!validator.isAlphanumeric(req.params.action))
                    )

            ) {
        console.log('\n+++++++++++++++++\nvalidation error\n');
        console.log(req.params);
        sendOutJSON(res, 400, 'Invalid parameters', null);
        return false;
    } else {
        return true;
    }
}


/* /EXTRA FUNCTIONS */
