var jszip = require('node-zip');
var xml2js = require('xml2js');
var parser = new xml2js.Parser();
var request = require('request');
var crypto = require('crypto');

var fs = require('fs');
var Epub = require('./epub.js');

export function open(file){
	// DO open shit here

	//FIXME: this!!
	var epubdata = {};
	var md5hash;
	var zip;
	var containerData;
	var htmlNav = '<ul>';
	var container, opf, ncx,
	opfPath, ncxPath, opsRoot,
	uniqueIdentifier, uniqueIdentifierValue, uniqueIdentifierScheme = null, 
	opfDataXML, ncxDataXML,
	opfPrefix = '', dcPrefix = '', ncxPrefix = '',
	metadata, manifest, spine, guide, nav,
	root, ns, ncxId,
	epub3CoverId, epub3NavId, epub3NavHtml, epub2CoverUrl = null,
	isEpub3, epubVersion;
	var itemlist, itemreflist;
	var itemHashById = {};
	var itemHashByHref = {};
	var linearSpine = {};
	var spineOrder = [];
	var simpleMeta = [];

	getFileBuffer(file)
	  .then((data)=>{
	  	return readAndParseData(data);
	  })
	  .then((parsedData)=>{
	  	md5hash = parsedData['md5hash'];
	  	zip = parsedData['zip'];
	  	containerData = parsedData['containerData'];
      container = containerData.container;

	  	return parseEpub(containerData);
	  })
	  .then((containerJSON) => {
			opfPath = extractOpfPath(containerJSON.container);
			opsRoot = extractOpsRoot(opfPath);
      console.log('opsRoot is:'+opsRoot+' (derived from '+root+')');

			// get the OPF data and parse it
			console.log('parsing OPF data');
			opfDataXML = extractText(opfPath);
			return extractOpf(opfDataXML.toString());
	  }).then((opf) => {
			uniqueIdentifier = opf["$"]["unique-identifier"];
			epubVersion = opf["$"]["version"][0];

			isEpub3 = (epubVersion=='3'||epubVersion=='3.0') ? true : false;
			//  console.log('epub version:'+epubVersion);
			for(att in opf["$"]) {
				if(att.match(/^xmlns\:/)) {
					ns = att.replace(/^xmlns\:/,'');
					if(opf["$"][att]=='http://www.idpf.org/2007/opf') opfPrefix = ns+':';
					if(opf["$"][att]=='http://purl.org/dc/elements/1.1/') dcPrefix = ns+':';
				}
			}
	  })
	  .catch((e) => {
	  	console.error(e);
	  })
}

/* Util Funcs */
function extractText(zip, filename){
	var file = zip.file(filename);
	if(typeof file !== 'undefined' || file !== null) {
		return file.asText();
	} else {
		throw 'file '+filename+' not found in zip';
	}
}

function extractBinary(zip, filename){
	var file = zip.file(filename);
	if(typeof file !== 'undefined') {
		return file.asBinary();
	} else {
		return '';
	}
}

/*Private functions*/
function getFileBuffer(file){
	return new Promise((resolve, reject) => {
		if(Buffer.isBuffer(file)) {
			resolve(file)
		} else if(file.match(/^https?:\/\//i)) { // is a URL
			request({ 
		    uri:file,
		    encoding:null /* sets the response to be a buffer */
			}, function (error, response, body) {
	      if (!error && response.statusCode == 200) {
		      var b = body;
			    resolve(b);
	      } else reject(error);
			});
		} else { // assume local full path to file
			return resolve(fs.readFileSync(file, 'binary'));
		}
	});
}

function readAndParseData(data){
  const md5hash = crypto.createHash('md5').update(data).digest("hex"); //FIXME: why update?
  const zip = new jszip(data.toString('binary'), {binary:true, base64: false, checkCRC32: true});
  const containerData = extractText(zip, 'META-INF/container.xml');
  
  return Promise.resolve({md5hash, zip, containerData});
}

function parseEpub(containerData){
	return new Promise((resolve, reject) => {
		parser.parseString(containerData, function (err, containerJSON) {
			if(err) reject(err);
			else resolve(containerJSON);
     });
	})
}

function extractOpfPath(container){
	return container.rootfiles[0].rootfile[0]["$"]["full-path"];
}

function extractOpsRoot(opfPath){
	// set the opsRoot for resolving paths
	let opsRoot = '';
  if(opfPath.match(/\//)) { // not at top level
    opsRoot = opfPath.replace(/\/([^\/]+)\.opf/i, '');
		if(!opsRoot.match(/\/$/)) { // does not end in slash, but we want it to
		 opsRoot += '/';
		}
		if(opsRoot.match(/^\//)) {
		 opsRoot = opsRoot.replace(/^\//, '');
		}
  }

  return opsRoot;
}

function extractOpf(opfXmlString){
	return new Promise((resolve, reject) => {
		parser.parseString(opfXmlString, function(err, opfJSON){
			if(err) reject(err);
			else {
				const opf = (opfJSON["opf:package"]) ? opfJSON["opf:package"] : opfJSON["package"];
				resolve(opf);
			}
		})
	})
}