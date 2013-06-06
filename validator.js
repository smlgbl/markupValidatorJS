"use strict";

var request = require('request'),
	j2h = require('json2html'),
	fs = require('fs'),
	w3url = 'http://validator.w3.org/check',
	uriOpt = '?uri=',
	outputOpt = '&output=json',
	saveFolder = 'checked/',
	changedFolder = 'changed/',
	diffsFound = 0,
	errors = {},
	urlsEnv = process.env.URLS,
	buildNo = process.env.BUILD_NUMBER,
	urls = [];

var NEW_ERROR = "new",
	OLD_ERROR = "gone";

if( urlsEnv && urlsEnv.length > 0 ) {
	urls = urlsEnv.split(' ');
	processUrls();
} else {
	console.log( "Please provide a list of URLs as space-separated list in the environment variable URLS." );
	process.exit(1);
}

process.on('exit', function() {
	console.log( "Done." );
	process.exit( diffsFound );
});

function processUrls( ) {
	urls.forEach( function( url, index ) {
		setTimeout( function() {
			console.log( "Checking " + url );
			errors[ url ] = {
				nu: false,
			ol: false,
			changes: []
			};
			readOldErrors( url );
			getW3sOpinion( url );
		}, 1000*index);
	});
}

function readOldErrors( url ) {
	var fileName = getJsonFileName( url );
	fs.exists( fileName, function( exists ) {
		if( !exists ) {
			console.log( "Old file doesn't exist" );
			errors[ url ].ol = {};
		} else {
			console.log( "Old file exists");
			fs.readFile( fileName, function( err, data ) {
                if (!err) {
                    if (data && data.length) {
                        try {
                            var j = JSON.parse(data);
                            console.log("Setting old data for " + url);
                            errors[ url ].ol = j;
                        } catch (e) {
                            console.log(e);
                        }
                    } else {
                        console.log(" - but it's empty!");
                        errors[ url ].ol = {};
                    }
                } else {
                    console.log("Unable to read file " + fileName);
                }
			});
		}
		compareAndSaveIfDone();
	});
}

function getW3sOpinion( url ) {
	console.log("requesting for " + url);
	var requestOptions = {
		'url': w3url + uriOpt + url + outputOpt,
		headers: {
			'user-agent': "Mozilla/5.0"
		}
	};
	request(requestOptions, function( error, resp, body ) {
		if( !error ) {
			if( resp && resp.statusCode === 200 ) {
				try {
					var j = JSON.parse( body );
					console.log( "Setting new data for " + url );
					errors[ url ].nu = j;
				} catch( e ) {
					console.log( "Error in parsing new data " + e );
					console.log( "Data: " + body );
					errors[ url ].nu = {};
				}
			} else {
				console.log("Error in request: " + JSON.stringify(resp, null, 4));
			}
		} else {
			console.log( "Error in request for " + url + ": " + error );
			errors[ url ].nu = {};
		}
		compareAndSaveIfDone();
	});
}

function compareAndSaveIfDone() {
	if( areWeDone() ) {
		Object.keys( errors ).forEach( function( url ) {
			console.log( "Checking for data of " + url );
			if( findChanges( errors[url].nu, errors[url].ol, url ) ) {
				console.log( "Saving for " + url );
				saveFile( url );
				diffsFound = 1;
			} else {
				console.log( "No differences found for " + url );
			}
		});
	}
}

function findChanges( nu, ol, url ) {
	var changesFound = false;
	console.log( "Comparing " );
	if( !nu || !ol ) {
		console.log( "Something went wrong. Very wrong. nu: " + nu + ", ol: " + ol);
		return true;
	}

	if( nu.messages ) {
		if( nu.messages.length && ( ! ol.messages || ! ol.messages.length ) ) {
			console.log( "No old errors - all new!" );
			return true;
		}

		if( ol.messages && ol.messages.length ) {
			if( nu.messages.length > ol.messages.length ) {
				nu.messages.forEach( function( n ) {
					if( ! ol.messages.some( function( o ) {
						if( o.message === n.message && o.lastLine === n.lastLine ) {
							return true;
						}
					}) && isNotJustInfo( n ) ) {
						n.changeType = NEW_ERROR;
						errors[ url ].changes.push(n);
						changesFound = true;
					}
				});
				// less errors
			} else if( nu.messages.length === ol.messages.length ) {
				// check for different error message
				nu.messages.forEach( function( n ){
					if( ! ol.messages.some( function( o ) {
						if( o.message === n.message ) {
							return true;
						}
					}) && isNotJustInfo( n ) ) {
						n.changeType = NEW_ERROR;
						errors[ url ].changes.push(n);
						changesFound = true;
					}
				});
			}
			else {
				ol.messages.forEach( function( o ) {
					if( ! nu.messages.some( function( n ) {
						if( n.message === o.message && n.lastLine === o.lastLine ) {
							return true;
						}
					}) && isNotJustInfo( o ) ) {
						o.changeType = OLD_ERROR;
						errors[ url ].changes.push(o);
						changesFound = true;
					}
				});
			}
		}
	}
	return changesFound;
}

function isNotJustInfo( msg ) {
	return ( msg.type !== 'info' || ( msg.subtype && msg.subtype === 'warning' ) );
}

function areWeDone() {
	var notDone = Object.keys( errors ).some( function( e ) {
		if( errors[e].nu === false || errors[e].ol === false ) {
			return true;
		}
	});
	return !notDone;
}

function getJsonFileName( urlName ) {
	return saveFolder + urlName.replace( /\//g, '-' ) + '.json';
}

function getHtmlFileName( urlName ) {
	return saveFolder + urlName.replace( /\//g, '-' ) + '.html';
}

function getHtmlChangeFileName( urlName ) {
	var b = buildNo ? '.' + buildNo : '';
	return changedFolder + urlName.replace( /\//g, '-' ) + b + '.html';
}

function saveFile( url ) {
	try {
		var data = JSON.stringify( errors[url].nu, null, 4 );
		var html = j2h.render( errors[url].nu );
		var changes = j2h.render( errors[url].changes );

		fs.writeFile( getJsonFileName( url ), data, function( err ) {
			if( err ) throw err;
			console.log( 'Saved ' + getJsonFileName( url ) );
		});
		fs.writeFile( getHtmlFileName( url ), html, function( err ) {
			if( err ) throw err;
			console.log( 'Saved ' + getHtmlFileName( url ) );
		});
		if( Object.keys( errors[url].changes ).length ) {
			fs.writeFile( getHtmlChangeFileName( url ), changes, function( err ) {
				if( err ) throw err;
				console.log( 'Saved ' + getHtmlChangeFileName( url ) );
			});
		}
	} catch( e ) {
		console.log( "Error in JSON" );
	}
}

function printChanges() {
	Object.keys( errors ).forEach( function( e ) {
		if( errors[e].changes.length ) {
			errors[e].changes.forEach( function( c ) {
				console.log( j2h.render( c ) );
			});
		}
	});
}

function chopSlashAtEnd( str ) {
	return ( str.lastIndexOf( '/' ) === str.length -1 ) ? str.slice(0, -1) : str;
}
