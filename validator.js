var request = require('request')
, j2h = require('json2html')
, fs = require('fs')
, w3url = 'http://localhost/w3c-validator/check'
, uriOpt = '?uri='
, outputOpt = '&output=json'
, saveFolder = 'checked/'
, changedFolder = 'changed/'
, diffsFound = 0
, errors = {}
, urlsEnv = process.env['URLS']
, urls = []

var NEW_ERROR = "new"
, OLD_ERROR = "gone"

if( urlsEnv && urlsEnv.length > 0 ) {
	urls = urlsEnv.split(' ')
	processUrls()
} else {
	console.log( "Please provide a list of URLs as space-separated list in the environment variable URLS." )
	process.exit(1)
}

process.on('exit', function() {
	console.log( "Done." )
	process.exit( diffsFound )
})

function processUrls( ) {
	urls.forEach( function( url ) {
		console.log( "Checking " + url )
		errors[ url ] = { 
			nu: false,
			ol: false,
			changes: []
		}
		readOldErrors( url )
		getW3sOpinion( url )
	})
}

function readOldErrors( url ) {
	var fileName = getJsonFileName( url )
	fs.exists( fileName, function( exists ) {
		if( !exists ) {
			console.log( "Old file doesn't exist" )
			errors[ url ].ol = {}
		} else {
			console.log( "Old file exists")
			fs.readFile( fileName, function( err, data ) {
				if( err ) console.log( "Unable to read file " + fileName )
				else {
					if( data && data.length ) {
						try {
							var j = JSON.parse( data )
							console.log( "Setting old data for " + url )
							errors[ url ].ol = j
						} catch( e ) {
							console.log( e )
						}
					} else {
						console.log( " - but it's empty!")
						errors[ url ].ol = {}
					}
				}
			})
		}
		compareAndSaveIfDone()
	})
}

function getW3sOpinion( url ) {
	request( w3url + uriOpt + url + outputOpt, function( error, resp, body ) {
		if( !error ) {
			if( resp && resp.statusCode == 200 ) {
				try {
					var j = JSON.parse( body )
					console.log( "Setting new data for " + url )
					errors[ url ].nu = j
				} catch( e ) {
					console.log( "Error in parsing new data " + e )
					errors[ url ].nu = {}
				}
			}
		} else {
			console.log( "Error in request for " + url + ": " + error )
			errors[ url ].nu = {}
		}
		compareAndSaveIfDone()
	})
}

function compareAndSaveIfDone() {
	if( areWeDone() ) {
		Object.keys( errors ).forEach( function( url ) {
			console.log( "Checking for data of " + url )
			if( findChanges( errors[url].nu, errors[url].ol, url ) ) {
				console.log( "Saving for " + url )
				saveFile( url )
				diffsFound = 1
			} else {
				console.log( "No differences found for " + url )
			}
		})
	}
}

function findChanges( nu, ol, url ) {
	var changesFound = false
	console.log( "Comparing " )
	if( !nu || !ol ) {
		console.log( "Something went wrong. Very wrong. nu: " + nu + ", ol: " + ol)
		return true
	}

	if( nu.messages ) {
		if( nu.messages.length && ( ! ol.messages || ! ol.messages.length ) ) {
			console.log( "No old errors - all new!" )
			return true
		}

		if( ol.messages && ol.messages.length ) {
			if( nu.messages.length >= ol.messages.length ) {
				nu.messages.forEach( function( n ) {
					if( ! ol.messages.some( function( o ) {
						if( o.message == n.message && o.lastLine == n.lastLine ) {
							return true
						}
					})) {
						n.changeType = NEW_ERROR
						errors[ url ].changes.push(n)
						changesFound = true
					}
				})
				// less errors
			} else {
				ol.messages.forEach( function( o ) {
					if( ! nu.messages.some( function( n ) {
						if( n.message == o.message && n.lastLine == o.lastLine ) {
							return true
						}
					})) {
						o.changeType = OLD_ERROR
						errors[ url ].changes.push(o)
						changesFound = true
					}
				})
			}
		}
	}
	return changesFound
}

function areWeDone() {
	var notDone = Object.keys( errors ).some( function( e ) {
		if( errors[e].nu == false || errors[e].ol == false ) {
			return true
		}
	})
	return !notDone
}

function getJsonFileName( urlName ) {
	return saveFolder + urlName.replace( /\//g, '-' ) + '.json'
}

function getHtmlFileName( urlName ) {
	return saveFolder + urlName.replace( /\//g, '-' ) + '.html'
}

function getHtmlChangeFileName( urlName ) {
	return changedFolder + urlName.replace( /\//g, '-' ) + '.html'
}

function saveFile( url ) {
	try{ 
		var data = JSON.stringify( errors[url].nu, null, 4 )
		var html = j2h.render( errors[url].nu )
		var changes = j2h.render( errors[url].changes )
	} catch( e ) {
		console.log( "Error in JSON" )
		return
	}
	
	fs.writeFile( getJsonFileName( url ), data, function( err ) {
		if( err ) throw err
		console.log( 'Saved ' + getJsonFileName( url ) )
	})
	fs.writeFile( getHtmlFileName( url ), html, function( err ) {
		if( err ) throw err
		console.log( 'Saved ' + getHtmlFileName( url ) )
	})
	fs.writeFile( getHtmlChangeFileName( url ), changes, function( err ) {
		if( err ) throw err
		console.log( 'Saved ' + getHtmlChangeFileName( url ) )
	})
}

function printChanges() {
	Object.keys( errors ).forEach( function( e ) {
		if( errors[e].changes.length ) {
			errors[e].changes.forEach( function( c ) {
//				console.log( (( c.changeType === NEW_ERROR ) ? "New" : "Deleted" ) + " error: " + JSON.stringify( c, null, 4 ) )
				console.log( j2h.render( c ) )
			})
		}
	})
}

function chopSlashAtEnd( str ) {
	return ( str.lastIndexOf( '/' ) === str.length -1 ) ? str.slice(0, -1) : str
}
