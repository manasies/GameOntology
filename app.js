const express = require('express')
const expressHBS = require('express-handlebars')
const fs = require('fs')
const $rdf = require('rdflib')
const parser = require('sparql-http-client/ParsingClient')
const turtleString = fs.readFileSync('users.ttl').toString()

const store = $rdf.graph()

$rdf.parse(
	turtleString,
	store,
	"http://gameontology.com/owl/users",
	"text/turtle"
)

const stringQuery = `
	SELECT
		?id
		?username
        ?real_name
		?favorite_game
		?favorite_genre
	WHERE {
		?user a <http://gameontology.com/owl/users#User> .
		?user <http://gameontology.com/owl/users#id> ?id .
		?user <http://gameontology.com/owl/users#username> ?username .
		?user <http://gameontology.com/owl/users#real_name> ?real_name .
		?user <http://gameontology.com/owl/users#favorite_game> ?favorite_game .
		?user <http://gameontology.com/owl/users#favorite_genre> ?favorite_genre .
	}
`

const query = $rdf.SPARQLToQuery(stringQuery, false, store)

const users = store.querySync(query).map(
	userResult => {
		return {
			id: userResult['?id'].value,
			username: userResult['?username'].value,
			real_name: userResult['?real_name'].value,
			favorite_game: userResult['?favorite_game'].value,
			favorite_genre: userResult['?favorite_genre'].value
		}
	}
)

const client = new parser({
	endpointUrl: 'https://dbpedia.org/sparql'
})

// GETTING THE ABSTRACT FOR PREFERED GAME
for (const user of users) {
	const query = `
		PREFIX dbpedia: <http://dbpedia.org/resource/>		
		PREFIX dbpedia-owl: <http://dbpedia.org/ontology/>
		
		SELECT ?abstract
		WHERE {
  		dbpedia:${user.favorite_game} dbpedia-owl:abstract ?abstract .
  		filter(langMatches(lang(?abstract),"en"))
		}
	`
	client.query.select(query).then(rows => {
		user.game_abstract = rows[0].abstract.value
	}).catch(error => {
		console.log(error)
        console.log(user)
	})
}

//GETTING THE RELEASE DATE OF THE USERS FAVORITE GAME
for (const user of users) {
	const query = `
		PREFIX dbpedia: <http://dbpedia.org/resource/>		
		PREFIX dbpedia-owl: <http://dbpedia.org/ontology/>
		
		SELECT ?releaseDate
		WHERE {
  		dbpedia:${user.favorite_game} dbpedia-owl:releaseDate ?releaseDate .
		}
	`
	client.query.select(query).then(res => {
		user.release_date = res[0].releaseDate.value
	}).catch(error => {
		console.log(error)
        console.log(user)
	})
}

//GETTING THE DEVELOPER OF THE USERS FAVORITE GAME
for (const user of users) {
	const query = `
		PREFIX dbpedia: <http://dbpedia.org/resource/>		
		PREFIX dbpedia-owl: <http://dbpedia.org/ontology/>
		
		SELECT ?developer
		WHERE {
  		dbpedia:${user.favorite_game} dbpedia-owl:developer ?developer .
		}
	`
	client.query.select(query).then(res => {
		user.game_dev = res[0].developer.value
	}).catch(error => {
        console.log('CRASHING HERE')
        console.log(user)
	})
}

const endpointUrl = 'https://query.wikidata.org/sparql'

//GETTING THE PREFERED GENRE OF THE USER BASED ON HIS FAVORITE GAME
async function wikiDataReq() {
    for (const user of users) {
        const query2 = `
        PREFIX bd: <http://www.bigdata.com/rdf#> 
        PREFIX wd: <http://www.wikidata.org/entity/> 
        PREFIX wdt: <http://www.wikidata.org/prop/direct/> 
        PREFIX wikibase: <http://wikiba.se/ontology#> 
        
        select  ?objet ?objectLabel ?genreLabel
        where {
            ?object wdt:P31 wd:Q7889.
            ?object wdt:P136 ?genre.
            ?object rdfs:label "${user.favorite_game.replace(/_/g, ' ')}"@en. 
            SERVICE wikibase:label {
                bd:serviceParam wikibase:language "en" .
            }
        } Limit 1`
        console.log(query2)
        const client2 = new parser ({ endpointUrl })
        const request2 = await client2.query.select(query2)

        request2.forEach(resp => {
            Object.entries(resp).forEach(([key, value]) => {
                if (key == "genreLabel") {
                    user.favorite_genre = value.value
                }
            })
        })
    }
}

wikiDataReq()


const app = express()

app.engine('hbs', expressHBS.engine({
	defaultLayout: 'layout.hbs'
}))

app.use(express.static('public'))

app.get('/', function (req, res) {
	res.render('index.hbs');
})

app.get('/userlist', function (req, res) {
    const model = {
        users
    }
    res.render('userlist.hbs', model);
})

app.get('/user/:id', function (req, res) {
    let id = req.params.id
    let model = {
        users: users.find(user => user.id == id)
    }
    res.render('user.hbs', model);
})

app.listen(8080);