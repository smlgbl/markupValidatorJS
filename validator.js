var request = require('request')
, fs = require('fs')
, w3url = 'http://validator.w3.org/check'
, uriOpt = '?uri='
, outputOpt = '&output=json'
, saveFolder = 'checked/'
, changedFolder = 'changed/'
, diffsFound = 0
, errors = {}
, urlsEnv = process.env['URLS']
, urls = []

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
			ol: false
		}
		readOldErrors( url )
		getW3sOpinion( url )
	})
}

function getSaveName( urlName ) {
	return saveFolder + urlName.replace( /\//g, '-' ) + '.json'
}

function getChangedSaveName( urlName ) {
	return changedFolder + urlName.replace( /\//g, '-' ) + '.json'
}

function getW3sOpinion( url ) {
	request( w3url + uriOpt + url + outputOpt, function( error, resp, body ) {
		if( !error ) {
			if( resp && resp.statusCode == 200 ) {
				try {
					var j = JSON.parse( body )
					console.log( "Setting new data for " + url )
					errors[ url ].nu = j
					finishIfDone()
				} catch( e ) {
					console.log( e )
				}
			}
		} else {
			console.log( "Error in request for " + url + ": " + error )
			errors[ url ].nu = {}
		}
	})
}

function saveFile( url, jsonData ) {
	var data = JSON.stringify( jsonData, null, 4 )
	
	fs.writeFile( getSaveName( url ), data, function( err ) {
		if( err ) throw err
		console.log( 'Saved ' + getSaveName( url ) )
	})
	fs.writeFile( getChangedSaveName( url ), data, function( err ) {
		if( err ) throw err
		console.log( 'Saved ' + getChangedSaveName( url ) )
	})
}

function readOldErrors( url ) {
	var fileName = getSaveName( url )
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
	})
}

function areWeDone() {
	var notDone = Object.keys( errors ).some( function( e ) {
		if( errors[e].nu == false || errors[e].ol == false ) {
			console.log( "Waiting for validation of " + e )
			return true
		}
	})
	return !notDone
}

function finishIfDone() {
	if( areWeDone() ) {
		Object.keys( errors ).forEach( function( url ) {
			console.log( "Checking for data of " + url )
			if( compareErrorObjects( errors[url].nu, errors[url].ol ) ) {
				console.log( "Saving for " + url )
				saveFile( url, errors[url].nu )
				diffsFound = 1
			} else {
				console.log( "No differences found for " + url )
			}
		})
	}
}

function compareErrorObjects( nu, ol ) {
	console.log( "Comparing ..." )
	if( nu.messages ) {
		if( ol && ol.messages ) {
			if( nu.messages.length != ol.messages.length ) {
				console.log( "Diff in length already!" )
				return true
			} else {
				if( nu.messages.some( function( msg, index ) {
					if( msg.message != ol.messages[index].message ) {
						return true
					}
				})) {
					return true
				}
			} 
		} else {
			return true
		} 
	}
	return false
}

