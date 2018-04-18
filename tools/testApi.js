'use strict';

const axios = require('axios');

const exec = require('child_process').exec;

const hostNode = "http://127.0.0.1:8021/";

function User(email, password) {
    this.email = email;
    this.password = password;
    this.callingApp = "testApp.js";
    this.restart = true;

}

User.prototype.restartWebservices = function restartWebservices() {
    if(this.restart) {
        this.restart = false
        exec('sudo pm2 restart webservices ',
            function (error, stdout, stderr) {
                console.log("Webservices restarted")
                console.log("End check api at " +  new Date());
            });
    }

}

User.prototype.checkApi = function getApi(tries){
    if(tries>0) {


        axios.get(hostNode + 'v3/cars', {

            auth: {
                username: this.email,
                password: this.password
            },
            timeout: 10000
        })
            .then(response => {
                if (response.status == 200) {
                    this.restart = true;
                    console.log("got status code: " + response.status);
                    console.log("End check api at " +  new Date());
                } else {
                    console.log("Error calling api status: "+response.status + " tries: " +tries);
                    setTimeout(()=> {this.checkApi(tries-1)},2000);
                }
            })
            .catch(error => {
                if(tries==1) {
                    console.log(error);
                }
                console.log("Error calling api tries: " +tries);
                setTimeout(()=> {this.checkApi(tries-1)},2000);
            });
    }else{
        this.restartWebservices();
    }
};


User.prototype.run = function() {

    console.log("run");
    setInterval(this.checkApi.bind(this, 5),3*60*1000);

};


let user = new User("itc@sharengo.eu","f7acd59ec39feb98b942d733a01f4df5");

console.log("\n\n");
console.log("Start check api at " +  new Date());
user.checkApi(5);