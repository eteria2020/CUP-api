

//const axios = require('axios'); //sarebbe bello ma abbiamo node brutto

var request = require('request');

var exec = require('child_process').exec;

var hostNode = "http://127.0.0.1:8021/";

function User(email, password) {
    this.email = email;
    this.password = password;
    this.callingApp = "testApp.js";
    this.restart = true;
}

User.prototype.restartWebservices = function restartWebservices() {
    if (this.restart) {
        this.restart = false;
        exec('pm2 restart webservices ', function (error, stdout, stderr) {
            console.log("Webservices restarted "+stdout);
            console.log("End check api at " + new Date());
        });
    }
};

User.prototype.checkApi = function getApi(tries,user) {
    if (tries > 0) {

        request({
            url: hostNode + 'v3/cars',
            timeout: 5000 // 5 sec
        }, function (error, response, body) {
            var _this = this;

            if (error) {
                if (tries == 1) {
                    console.log(error);
                }
                console.log("Error calling api tries: " + tries);
                setTimeout(function () {
                    user.checkApi(tries - 1,user);
                }, 2000);
            } else {
                if (response.statusCode == 200) {
                    this.restart = true;
                    console.log("got status code: " + response.statusCode);
                    console.log("End check api at " + new Date());
                } else {
                    console.log("Error calling api status: " + response.statusCode + " tries: " + tries);
                    if (tries == 1) {
                        console.log(response);
                    }
                    setTimeout(function () {
                        user.checkApi(tries - 1,user);
                    }, 1000);
                }
            }
        });

        //     axios.get(hostNode + 'v3/cars', {
        //
        //     auth: {
        //         username: this.email,
        //         password: this.password
        //     },
        //     timeout: 10000
        // })
        //     .then(response => {
        //         if (response.status == 200) {
        //             this.restart = true;
        //             console.log("got status code: " + response.status);
        //             console.log("End check api at " +  new Date());
        //         } else {
        //             console.log("Error calling api status: "+response.status + " tries: " +tries);
        //             if(tries==1) {
        //                 console.log(response);
        //             }
        //             setTimeout(()=> {this.checkApi(tries-1)},1000);
        //         }
        //     })
        //     .catch(error => {
        //         if(tries==1) {
        //             console.log(error);
        //         }
        //         console.log("Error calling api tries: " +tries);
        //         setTimeout(()=> {this.checkApi(tries-1)},2000);
        //     });
    } else {
        this.restartWebservices();
    }
};

User.prototype.run = function () {

    console.log("run");
    setInterval(this.checkApi.bind(this, 5), 3 * 60 * 1000);
};

var user = new User("itc@sharengo.eu", "f7acd59ec39feb98b942d733a01f4df5");

console.log("\n\n");
console.log("Start check api at " + new Date());
user.checkApi(5,user);