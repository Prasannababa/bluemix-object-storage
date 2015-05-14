/*jshint node:true*/

var express = require('express');
var multer  = require('multer');
var request = require('request');

var USER = "user"
var CONTAINER = "usercontainer"

// Environment variables provided by Bluemix
var appInfo = JSON.parse(process.env.VCAP_APPLICATION || "{}");
var serviceInfo = JSON.parse(process.env.VCAP_SERVICES || '{}');

console.log("--- App object: ");
console.log(appInfo);
console.log("--- Services object: ");
console.log(serviceInfo);
console.log("--- Credentials object: ");
if (Object.keys(serviceInfo).length > 0) {
  console.log(serviceInfo['objectstorage'][0]['credentials']);
}

var cache = {};
var auth = null;

var app = express();

// Configure file upload handling using multer
app.use(multer({ dest: './uploads/',
    rename: function (fieldname, filename) {
        return filename+Date.now();
    },
    onFileUploadStart: function (file) {
        console.log(file.originalname + ' is starting ...')
    },
    onFileUploadComplete: function (file) {
        console.log(file.fieldname + ' uploaded to  ' + file.path)
        if (!auth) setAppVars();
        var userInfo = cache[USER];
        var resHandler = function(error, response, body) {};
        var buff = new Buffer(file.buffer, 'binary');
        uploadFileToSwift(USER, CONTAINER, file.originalname, buff.toString('base64'), resHandler);
    },
    inMemory: true
}));

// Set up static file handling
app.use(app.router);
app.use(express.errorHandler());
app.use(express.static(__dirname + '/public')); 
app.set('view engine', 'ejs');
app.set('views', __dirname + '/views'); 
app.engine('html', require('ejs').renderFile);


//
// Utility methods
//
String.prototype.endsWith = function(suffix) {
    return this.indexOf(suffix, this.length - suffix.length) !== -1;
};

var setAppVars = function() {
    console.log('setAppVars');
    var credentials = serviceInfo['objectstorage'][0]['credentials'];
    console.log("set_app_vars - auth_uri: " + credentials['auth_uri']);
    console.log("set_app_vars - userid: " + credentials['username']);
    console.log("set_app_vars - password: " + credentials['password']);
    auth = {
        "auth_uri": credentials['auth_uri'],
        "userid" : credentials['username'],
        "password" : credentials['password']
    };
    auth["secret"] = "Basic " + Buffer(auth.userid + ":" + auth.password).toString("base64");
    console.log("set_app_vars - auth: " + JSON.stringify(auth, null, 2));
};

function jsonResponse(res, json) {
    console.log('jsonResponse');
    console.log(JSON.stringify(json, null, 2));
    res.writeHead(200, {"Content-Type": "text/plain"});
    res.end(JSON.stringify(json, null, 2));
}

var getToken = function(userid, callback) {
    console.log('getToken');
    if (!auth) setAppVars(); 
    var reqOptions = {
        url: auth.auth_uri + '/' + userid,
        headers: {'accept': 'application/json', 'Authorization': auth.secret},
        timeout: 100000,
        method: 'GET'
    };
    console.log(JSON.stringify(reqOptions, null, 2));
    request(reqOptions, callback);
}

// Must have called the token method before this one to init (userInfo)
var createContainer = function(userid, containername, callback) {
    console.log('createContainer');
    var userInfo = cache[userid];
    console.log(userid);
    console.log(userInfo);
    console.log(containername);
    var reqOptions = {
        url: userInfo['url'] + "/" + containername,
        headers: {'accept': 'application/json', 'X-Auth-Token': userInfo['token']},
        timeout: 100000,
        method: 'PUT'
    };
    request(reqOptions, callback);
}

var listContainer = function(userid, containername, callback) {
    console.log('listContainer');
    var userInfo = cache[userid];
    console.log(userid);
    console.log(userInfo);
    console.log(containername);
    var reqOptions = {
        url: userInfo['url'] + "/" + containername,
        headers: {'accept': 'application/json', 'X-Auth-Token': userInfo['token']},
        timeout: 100000,
        method: 'GET'
    };
    request(reqOptions, callback);
}

var uploadFileToSwift = function(userid, containername, objname, objdata, callback) {
    console.log('uploadFileToSwift');
    var userInfo = cache[userid];
    console.log(userid);
    console.log(userInfo);
    console.log(containername);
    var reqOptions = {
        url: userInfo['url'] + "/" + containername + "/" + objname,
        headers: {'accept': 'application/json', 'X-Auth-Token': userInfo['token']},
        timeout: 100000,
        body: objdata,
        method: 'PUT'
    };
    request(reqOptions, callback);
}

var downloadFileFromSwift = function(userid, containername, objname, callback) {
    console.log('downloadFileFromSwift');
    var userInfo = cache[userid];
    console.log(userid);
    console.log(userInfo);
    console.log(containername);
    var reqOptions = {
        url: userInfo['url'] + "/" + containername + "/" + objname,
        headers: {'accept': 'application/json', 'X-Auth-Token': userInfo['token']},
        timeout: 100000,
        method: 'GET'
    };
    request(reqOptions, callback);
}

var deleteFileFromSwift = function(userid, containername, objname, callback) {
    console.log('deleteFileFromSwift');
    var userInfo = cache[userid];
    console.log("Deleting " + objname + " from " + userid + "/" + containername);
    console.log(userid);
    console.log(userInfo);
    console.log(containername);
    var reqOptions = {
        url: userInfo['url'] + "/" + containername + "/" + objname,
        headers: {'accept': 'application/json', 'X-Auth-Token': userInfo['token']},
        timeout: 100000,
        method: 'DELETE'
    };
    request(reqOptions, callback);
}

var renderIndex = function(res, containerListingJSON) {
    console.log('renderIndex');
    var fileList = JSON.parse(containerListingJSON)
    console.log(fileList);
    containerFiles = fileList.map(function(val) {
        return val.name
    });
    res.render('main.html', { containerFiles: containerFiles });
}

//
//
// REST API definitions
//
//

//
// Get index page
//
app.get('/', function(req, res){
    console.log('/');

    if (Object.keys(serviceInfo).length > 0) {

      getToken(USER, function(error, response, body) {

        if (!error) {
          saveTokenResponseToCache(USER, response.headers['x-auth-token'], response.headers['x-storage-url']);

          createContainer(USER, CONTAINER, function(error, response, body) {

            if (!error) {
              console.log('Finished creating container');

              listContainer(USER, CONTAINER, function(error, response, body) {

                if (!error) {
                  console.log('Finished listing container');
                  renderIndex(res, body);
                } else {
                  res.end('Issue listing a container');
                }
              });

            } else {
              res.end('Issue creating a container');
            }
          });

        } else {
          res.end('Issue getting a token');
        }
      });

    } else {
      res.render('no-object-storage.html');
    }

});

//
// Upload
//
app.post('/upload', function(req, res){
    console.log('/upload');
    res.render('upload-success.html');
});

//
// Download
//
app.get('/download/:objname', function(req, res){
    console.log('/download/:objname');
    var resHandler = function(error, response, body) {
        if (!error && response.statusCode == 200) {
            var buff = new Buffer(body, 'base64')
            var data = buff.toString('binary');

            contentType = "";
            if (req.params.objname.endsWith(".jpg") || req.params.objname.endsWith(".jpeg")) {
              contentType = "image/jpeg";
            } else if (req.params.objname.endsWith(".gif")) {
              contentType = "image/gif";
            } else if (req.params.objname.endsWith(".png")) {
              contentType = "image/png";
            } else if (req.params.objname.endsWith(".bmp")) {
              contentType = "image/bmp";
            } else if (req.params.objname.endsWith(".pdf")) {
              contentType = "application/pdf";
            } else {
              contentType = "text/plain";
            }
            
            console.log("Downloading a " + contentType)
            res.writeHead(200, {"Content-Type": contentType});
            res.end(data, 'binary');
        } else {
            res.writeHead(200, {"Content-Type": "text/html"});
            res.end('Failed downloading ' + req.params.objname);
        }
    };
    downloadFileFromSwift(USER, CONTAINER, req.params.objname, resHandler);
});

//
// Delete
//
app.get('/delete/:objname', function(req, res){
    console.log('/delete/:objname');
    var resHandler = function(error, response, body) {
        if (!error && response.statusCode == 204) {
            res.writeHead(200, {"Content-Type": "text/html"});
            res.end('Delete succeeded, please return to <a href="/">the main page</a>');
        } else {
            res.writeHead(200, {"Content-Type": "text/html"});
            res.end('Delete did not succeed, please return to <a href="/">the main page</a> (Response Code: ' + response.statusCode + ', Error: ' + error + ')');
        }
    };
    deleteFileFromSwift(USER, CONTAINER, req.params.objname, resHandler);
});

var saveTokenResponseToCache = function(userid, token, url) {
    console.log('saveTokenResponseToCache');
    var body = {"userid": userid, "token": token, "url": url};
    cache[userid] = body;
    return body;
}


//
// Get token
//
app.get('/gettoken/:userid', function(req, res){
    console.log('/gettoken/:userid');
    var resHandler = function(error, response, res_body) {
        var body = {};
        if (!error && response.statusCode == 200) {
            body = saveTokenResponseToCache(req.params.userid, response.headers['x-auth-token'], response.headers['x-storage-url']);
        } else {
            body = {"error": error, "statusCode": response.statusCode};
        };
        jsonResponse(res, body);
    };
    getToken(req.params.userid, resHandler);
});

//
// Create container
//
app.get('/createcontainer/:userid/:containername', function(req, res){
    console.log('/createcontainer/:userid/:containername');
    var resHandler = function(error, response, body) {
        if (!error && (response.statusCode == 201 || response.statusCode == 204)) {
          body = {result: 'Succeeded!'};
        } else {
          body = {result: 'Failed!'};
        }
        jsonResponse(res, body);
    };
    createContainer(req.params.userid, req.params.containername, resHandler);
});

//
// Write object
//
app.get('/writeobj/:userid/:containername/:objname', function(req, res){
    console.log('/writeobj/:userid/:containername/:objname');
    var resHandler = function(error, response, body) {
        if (!error && response.statusCode == 201) {
            body = {result: 'Succeeded!'};
        } else {
            body = {result: 'Failed!'};
        }
        jsonResponse(res, body);
    };
    uploadFileToSwift(req.params.userid, req.params.containername, req.params.objname, "Some random data",  resHandler);
});

//
// Read object
//
app.get('/readobj/:userid/:containername/:objname', function(req, res){
    console.log('/readobj/:userid/:containername/:objname');
    var resHandler = function(error, response, body) {
        if (!error && response.statusCode == 200) {
            body = {result: 'Succeeded! ' + body +  ' - ' + response};
        } else {
            body = {result: 'Failed!'};
        }
        jsonResponse(res, body);
    };
    downloadFileFromSwift(req.params.userid, req.params.containername, req.params.objname,  resHandler);
});

//
// List files in container
//
app.get('/listcontainer/:userid/:containername', function(req, res){
    console.log('/listcontainer/:userid/:containername');
    var resHandler = function(error, response, body) {
        if (!error && response.statusCode == 200) {
            var fileList = JSON.parse(body)
            body = {result: 'Succeeded! ' + fileList[0].name};
        } else {
            body = {result: 'Failed!'};
        }
        jsonResponse(res, body);
    };
    listContainer(req.params.userid, req.params.containername, resHandler);
});


// The IP address of the Cloud Foundry DEA (Droplet Execution Agent) that hosts this application:
var host = (process.env.VCAP_APP_HOST || 'localhost');

// The port on the DEA for communication with the application:
var port = (process.env.VCAP_APP_PORT || 3000);

// Start server
app.listen(port, host);
console.log('Node Object Storage app started on port ' + port);
