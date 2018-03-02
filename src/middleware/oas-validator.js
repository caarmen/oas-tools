/*!
OAS-tools module 0.0.0, built on: 2017-03-30
Copyright (C) 2017 Ignacio Peluaga Lozada (ISA Group)
https://github.com/ignpelloz
https://github.com/isa-group/project-oas-tools

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program.  If not, see <http://www.gnu.org/licenses/>.*/

'use strict';

var exports;
var ZSchema = require("z-schema");
var yaml = require('js-yaml');
var fs = require('fs');
var path = require('path');
var http = require('http');
var logger = require('../logger/logger');
var deref = require('json-schema-deref');
var validator = new ZSchema({
  ignoreUnresolvableReferences: true,
  ignoreUnknownFormats: true
});

/**
 * Checks whether the provided specification file contains the requested url in the req value. If it contains it, then it must be checked whether the requested method is
 * specified in the specification for that requested url.
 * If this requested peer has a match in the specification file then this function returns true, otherwise it must return false.
 * @param {object} paths - Portion of code in yaml containing the path section from the spec file.
 * @param {string} requestedUrl - Requested url by the client. If the request had parameters in the query those won't be part of this variable.
 * @param {string} method - Method requested by the client.
 */
function specContainsPath(paths, requestedUrl, method) {
  logger.info("Requested method-url pair:");
  logger.info(method + " - " + requestedUrl);
  var res = false;
  if (paths.hasOwnProperty(requestedUrl)) {
    if (paths[requestedUrl].hasOwnProperty(method)) {
      res = true;
    }
  }
  return res;
}

/**
 * Checks if the data provided in the request is valid acording to what is specified in the oas specification file
 * @param {object} paths - Portion of code in yaml containing the path section from the spec file.
 * @param {string} requestedUrl - Requested url by the client. If the request had parameters in the query those won't be part of this variable.
 * @param {string} method - Method requested by the client.
 * @param {string} req - The whole req object from the client request.
 */
function checkRequestData(paths, requestedUrl, method, req) {
  var res = [];
  var missingParameters = [];
  var wrongParameters = [];
  if (paths[requestedUrl][method].hasOwnProperty('parameters')) {
    var params = paths[requestedUrl][method]['parameters'];
    for (var i = 0; i < params.length; i++) {
      if (params[i].required.toString() == 'true') {
        var name = params[i].name;
        var location = params[i].in;
        var schema = params[i].schema;

        if (req[location][name] == undefined) { //if the request is missing a required parameter acording to the spec: warning
          missingParameters.push([name, location]);
        }
        else{ // In case the parameter is indeed present, check type. In the case of array, check also type of its items!
          var value = JSON.parse(req[location][name]); //new String(req[location][name]);

          validator.validate(value, schema, function(err, valid) {

            if (err) {
              wrongParameters.push(name);
              if (Array.isArray(err)) {
                err = err[0];
              }

              if (err.code == "UNKNOWN_FORMAT") {
                var registeredFormats = ZSchema.getRegisteredFormats();
                logger.info("UNKNOWN_FORMAT error - Registered Formats: ");
                logger.info(registeredFormats);
              }
              throw new Error(err.message);

            } else {
              logger.info("Valid parameter on request");
            }
          });
        }
      }
    }
  }
  res.push(missingParameters);
  res.push(wrongParameters);
  return res;
}

exports = module.exports = function(specDoc) {
  deref(specDoc, function(err, fullSchema) {
    logger.info("Specification file dereferenced");
    specDoc = fullSchema;
  });
  return function OASValidator(req, res, next) {
    logger.info("______________________________________________________"); // separates initialization loggs and app execution loggs
    var spec = specDoc;
    var requestedUrl = req.url.split("?")[0]; //allows requests with parameters in the query
    var method = req.method.toLowerCase();
    res.locals.requestedUlr = requestedUrl;

    if (specContainsPath(spec.paths, requestedUrl, method) == true) { //In case the spec file contains the requested url, validate the request parameters
      var missingOrWrongParameters = checkRequestData(spec.paths, requestedUrl, method, req);
      if (missingOrWrongParameters[0].length > 0) {
        logger.info("WARNING: the following parameters were required but weren't sent in the request:");
        logger.info(missingOrWrongParameters[0]);
      }
      if (missingOrWrongParameters[1].length > 0) {
        logger.info("WARNING: the following parameters were not of the right type:");
        logger.info(missingOrWrongParameters[1]);
      }
      res.locals.spec = spec;
      next();
    } else { //In case the requested url is not in the spec file, inform the user
      res.status(400).send({
        message: "The requested path is not in the specification file"
      });
    }
  }
}