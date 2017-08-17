var jszip = require('node-zip');
var xml2js = require('xml2js');
var parser = new xml2js.Parser();
var request = require('request');
var crypto = require('crypto');

var fs = require('fs');
//var Epub = require('./epub.js');

// export function open(file){
// 	return new Epub(file);
// }

export default class Epub {
	constructor(file){
		this.file = file;
		this.paths = {};
		this.prefixes = {};

		this.isOpen = () => { return false; }
	}

	open() {
		let zip = null;

    return getFileBuffer(this.file)
			.then((data)=>{
				zip = new jszip(data.toString('binary'), {binary:true, base64: false, checkCRC32: true});
		  	return extractContainer(zip, data);
		  })
		  .then((_container)=>{
		  	this._container = _container;
		  	this.paths.opfPath = extractOpfPath(_container.container);
			  this.paths.opsRoot = extractOpsRoot(this.paths.opfPath);

		  	return extractOpf(zip, this.paths.opfPath);
		  }).then((_opf)=>{
		  	this._opf = _opf;
		  	//FIXME: add dcPrefix code
		  	this.opf = parseOpf(this._opf);

				this.isOpen = () => { return true; }
		  	return this;
		  })
		  .catch((e)=>{
		  	console.error(e);
		  })
	}

	getMetadata(){
		if(!this.isOpen()) throw new Error('Cant be invoked until epub is open!');
		//FIXME: Cleanup

		const simpleMeta = {};
		const itemHashes = this.getItemHashes();
		const itemHashById = itemHashes['itemHashById'];

		const uniqueIdentifier = this._opf["$"]["unique-identifier"];
	  const epubVersion = this._opf["$"]["version"][0];
	  const isEpub3 = (epubVersion=='3'||epubVersion=='3.0') ? true : false;
	  simpleMeta['uniqueIdentifier']=uniqueIdentifier;
	  simpleMeta['epubVersion']=epubVersion;
	  simpleMeta['isEpub3']=isEpub3;

    var metas = this.opf.metadata;
	  for(let prop in metas) {        
	    if(prop == 'meta') { // process a list of meta tags
	      for(var i = 0; i < metas[prop].length; i++) {            
	        var m = metas[prop][i].$;
	        if(typeof m.name !== 'undefined') {
	          simpleMeta[m.name] = m.content;
	        } else if (typeof m.property !== 'undefined') {
	          simpleMeta[m.property] = metas[prop][i]._;
	        }
	        if(m.name == 'cover') {
	          if (typeof itemHashById[m.content] !== 'undefined') {
	            const epub2CoverUrl = this.paths['opsRoot'] + itemHashById[m.content].$.href;
	            simpleMeta['epub2CoverUrl'] = epub2CoverUrl;
	          }
	        }
	      }          
	    } else if(prop != '$') {        
	      var content = '';
	      var atts = {};
	      if(metas[prop][0]) {
	        if(metas[prop][0].$ || metas[prop][0]._) { // complex tag
	          content = (metas[prop][0]._) ?
	            metas[prop][0]._ :
	            metas[prop][0];
	          if(metas[prop][0].$) { // has attributes
	            for(let att in metas[prop][0].$) {
	              atts[att]=metas[prop][0].$[att];
	            }
	          }
	        } else { // simple one, if object, assume empty
	          content = (typeof metas[prop][0] == 'object') ? '' : metas[prop][0];
	        }
	      }
	      if(typeof prop !== 'undefined') {
	        simpleMeta[prop] = content;
	      }
	      if(prop.match(/identifier$/i)) {
	        if(typeof metas[prop][0].$.id) {
	          if(metas[prop][0].$.id==uniqueIdentifier) {
	            if(typeof content == 'object') {
	              console.log('warning - content not fully parsed');
	              console.log(content);
	              console.log(metas[prop][0].$.id);
	            } else {
	              simpleMeta['uniqueIdentifierValue'] = content;
	              if(typeof metas[prop][0].$.scheme !== 'undefined') simpleMeta['uniqueIdentifierScheme'] = uniqueIdentifierScheme;
	            }
	          }
	        };
	      }
	    }
	  }
	  return simpleMeta;
	}

	getLinearSpine(){
		if(!this.isOpen()) throw new Error('Cant be invoked until epub is open!');

		const itemreflist = this.opf.spine.itemref;
		const spineOrder = []; //FIXME: Why is this needed?
		const linearSpine = {};
		for(let itemref in itemreflist) {
      var id = itemreflist[itemref].$.idref;
      spineOrder.push(itemreflist[itemref].$);
      if(itemreflist[itemref].$.linear=='yes' || typeof itemreflist[itemref].$.linear == 'undefined') {
        itemreflist[itemref].$.item = itemHashById[id];
        linearSpine[id] = itemreflist[itemref].$;
      }
    }
    return linearSpine;
	}

	getItemHashes(){
		if(!this.isOpen()) throw new Error('Cant be invoked until epub is open!');

		const itemHashByHref = {};
		const itemHashById = {};

    const itemlist = this.opf.manifest.item;
    const itemreflist = this.opf.spine.itemref;
    for(let item in itemlist) {
      const href = itemlist[item].$.href;
      const id = itemlist[item].$.id;
      const mediaType = itemlist[item].$['media-type']; // FIXME: Not required
      const properties = itemlist[item].$['properties']; // FIXME: Not required

      itemHashByHref[href] = itemlist[item];
      itemHashById[id] = itemlist[item];
    }
      
    return {itemHashById, itemHashByHref};
	}

	getZip(){
		return new Promise((resolve, reject)=>{
			getFileBuffer(this.file)
				.then((data)=>{
					zip = new jszip(data.toString('binary'), {binary: true, base64: false, checkCRC32: true});
					resolve(zip);
				}).catch((e)=>{
					reject(e);
				})
		});
	}

	static extractText(zip, filename){
		var file = zip.file(filename);
		if(typeof file !== 'undefined' || file !== null) {
			return file.asText();
		} else {
			throw 'file '+filename+' not found in zip';
		}
	}

	static extractBinary(zip, filename){
		var file = zip.file(filename);
		if(typeof file !== 'undefined') {
			return file.asBinary();
		} else {
			return '';
		}
	}

}

	function parseNcx(){
		//TODO: laters
    if(!ncxId) { // assume epub 3 navigation doc
      if(!isEpub3) throw new Error('ncx id not found but package indicates epub 2');
      ncxDataXML = '';
      ncx = {};
      ncxPath = '';
      htmlNav = null;
      if(!epub3NavHtml) throw new Error('epub 3 with no nav html');
      parser.parseString(epub3NavHtml, function (err, navJSON) {
        if(err) return cb(err);
        nav = navJSON;
        epubdata = getEpubDataBlock();
        // cb(null, epubdata);
      });
    } else { // epub 2, use ncx doc
      for(var item in manifest[opfPrefix+"item"]) {
        if(manifest[opfPrefix+"item"][item]["$"].id==ncxId) {
          ncxPath = opsRoot + manifest[opfPrefix+"item"][item]["$"].href;
        }
      }
      //console.log('determined ncxPath:'+ncxPath);
      ncxDataXML = extractText(zip, ncxPath);
      parser.parseString(ncxDataXML.toString(), function (err, ncxJSON) {
        if(err) throw err;
        // grab the correct ns prefix for ncx
        for(var prop in ncxJSON) {
          //console.log(prop);
          if(prop === '$') { // normal parse result
            setPrefix(ncxJSON);
          } else {
            if(typeof ncxJSON[prop]['$'] !== 'undefined') {
              //console.log(ncxJSON[prop]['$']);  
              setPrefix(ncxJSON[prop]);
            }
          }
        }              
        ncx = ncxJSON[ncxPrefix+"ncx"];
        var navPoints = ncx[ncxPrefix+"navMap"][0][ncxPrefix+"navPoint"];
        for(var i = 0; i < safeAccess(navPoints).length; i++) {
          processNavPoint(navPoints[i]);
        }
        htmlNav += '</ul>'+"\n";
        epubdata = getEpubDataBlock();
        // cb(null,epubdata);
      });
    }
	}

function extractContainer(zip, data){
  const containerData = Epub.extractText(zip, 'META-INF/container.xml');
  return new Promise((resolve, reject)=>{
  	parser.parseString(containerData, (err, containerJson)=>{
  		if(err) reject(err);
  		else resolve(containerJson);
  	})
  });
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

function extractOpf(zip, opfPath){
  const opfXmlString = Epub.extractText(zip, opfPath);

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

function parseOpf(opfJson){
	const opf = {};
  //FIXME: Error handling in this method

	for(var att in opfJson["$"]) {
		if(att.match(/^xmlns\:/)) {
			ns = att.replace(/^xmlns\:/,'');
			if(opf["$"][att]=='http://www.idpf.org/2007/opf') opf['prefix'] = ns+':';
		}
	}

  if(typeof opfJson[opf['prefix']+"manifest"] === 'undefined') {
	  // it's a problem
	  // gutenberg files, for example will lead to this condition
	  // we must assume that tags are not actually namespaced
	  opf['prefix'] = '';
  }
  try {
    opf['metadata'] = opfJson[opf['prefix']+"metadata"][0];
  } catch(e) {
    console.log('metadata element error: '+e.message);
    console.log('are the tags really namespaced with '+opf['prefix']+' or not? file indicates they should be.');
  }
  try {
    opf['manifest'] = opfJson[opf['prefix']+"manifest"][0];
  } catch (e) {
    console.log('manifest element error: '+e.message);
    console.log('are the tags really namespaced with '+opf['prefix']+' or not? file indicates they should be.');
    console.log('must throw this - unrecoverable');
    throw e;
  }
  try {
    opf['spine'] = opfJson[opf['prefix']+"spine"][0];
  } catch(e) {
    console.log('spine element error: '+e.message);
    console.log('must throw this');
    throw (e);
  }
  try {
    opf['guide'] = opfJson[opf['prefix']+"guide"][0];
  } catch (e) {
    ;
  }

  return opf;
}

function parseMeta(){
	/*Depends on opf*/
	uniqueIdentifier = opf["$"]["unique-identifier"];
	epubVersion = opf["$"]["version"][0];

	isEpub3 = (epubVersion=='3'||epubVersion=='3.0') ? true : false;

	/*Depends on itemlist*/
	const properties = itemlist[item].$['properties'];
	if(typeof properties !== 'undefined') {
		if(properties == 'cover-image') {
		  epub3CoverId = id;
		} else if (properties == 'nav') {
		  epub3NavId = id;
		  epub3NavHtml = Epub.extractText(opsRoot+href);
		}
	}

  try {
    ncxId = spine.$.toc;
  } catch(e) {
    ;
  }
}

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