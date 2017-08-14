var jszip = require('node-zip');
var xml2js = require('xml2js');
var parser = new xml2js.Parser();
var request = require('request');
var fs = require('fs');

var Epub = function() {};

Epub.prototype.zip = null;
Epub.prototype.zipEntries = null;

module.exports = Epub;