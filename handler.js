'use strict'

const axios = require('axios')
const MongoClient = require('mongodb').MongoClient
require('dotenv').config()

const url = process.env.MONGO_URI
const dev = 'https://api.better-call.dev/v1/contract/mainnet/KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton/tokens'
const client = new MongoClient(url)

// method to populate the DB with all owners via upsert. Takes around 60 mins (500k records).
const getOwners = async(arr,counter,owners) => {
  /*
  https://api.tzkt.io/v1/bigmaps/522/keys?sort.desc=id&select=key,value&offset=0&limit=10
  limit can be up to 1000
  [{"key":{"nat":"68596","address":"tz1d7i7nUREze4LCpfonUeaJgdfhcWnoy7p9"},"value":"1"},..]
  
  owners collection: {"token_id": 999999, "owner_id": "tz123", "balance": 0 }
  unique index on token_id, owner_id. Index on owner_id for search.
  */
  let res = await axios.get("https://api.tzkt.io/v1/bigmaps/511/keys?sort.desc=id&select=key,value&limit=50&offset=" + counter)
    .then(res => res.data)
  res = await res.map(async e => {

  try {
    const query = {"token_id": parseInt(e.key.nat), "owner_id": e.key.address}
    const update = { "$set": {"token_id":parseInt(e.key.nat), "owner_id": e.key.address, "balance": parseInt(e.value)} }
    const options = { upsert: true };
    console.log(e.key)
    let r = await owners.updateOne(query, update, options)
    if (r.modifiedCount === 1 || r.upsertedId !== null ) {
      return true //updated or inserted something new
    } else {
      return false //change from false to true to interate thru all results.
    }
  } catch (err) {
    console.log('err', e.key, err)
    return false
  }
})

  var promise = Promise.all(res.map(e => e))

  promise.then(async (results) => {
    if (!results.every( e => e === false)) { //looks at all results to see if there was a change
      await getOwners(arr, counter + 50, owners) //fetch more records if some results were updated
    }
  })
  console.log('end')
  return [arr, ...res]

}

////////////////////////
// method to populate the DB with objkt curation hDAO balances via upsert. 
// Full refresh takes around 10 mins (70k records).

const getTokenCurationBalance = async(arr,counter,objkts) => {
  /*
  https://api.tzkt.io/v1/bigmaps/519/keys?sort.desc=id&select=key,value&offset=0&limit=10
  limit can be up to 1000
  [{"key":"69976","value":{"issuer":"tz1ZM3gyiFnaU9itgTshE7Z2jgG3bTk4TF2z","hDAO_balance":"4471"}},..]
  
  `token_curations` collection: {"token_id": 999999, "hdao_balance": 0 }
  unique index on token_id.
  *** API has `hDAO_balance` in objkt
  Given the 1:1 relationship with objkt, this should be an object on `metadata` collection.
  Iterate through bigmap. stop when no more updates after a `counter` updates no more records
  Update only, if token_id missing, then will pick up in next call.
  */

  let res = await axios.get("https://api.tzkt.io/v1/bigmaps/519/keys?sort.desc=id&select=key,value&limit=50&offset=" + counter)
    .then(res => res.data)
  res = await res.map(async e => {

  try {
    const query = { "token_id": parseInt(e.key), hDAO_balance: {"$ne": parseInt(e.value.hDAO_balance) } }
    const update = { "$set": {"hDAO_balance": parseInt(e.value.hDAO_balance)} }
    console.log(e.key, e.value)
    let r = await objkts.findOneAndUpdate(query, update)
    console.log(r.lastErrorObject.updatedExisting)
    if (r.lastErrorObject.updatedExisting === true ) {
      return true //updated or inserted something new
    } else {
      return false //change from false to true to interate thru all results.
    }
  } catch (err) {
    console.log('err', e.key, err)
    return false
  }
})

  var promise = Promise.all(res.map(e => e))

  promise.then(async (results) => {
    if (!results.every( e => e === false)) { //looks at all results to see if there was a change
      await getTokenCurationBalance(arr, counter + 50, objkts) //fetch more records if some results were updated
    }
  })
  console.log('end')
  return [arr, ...res]

const getRoyalties = async(arr,counter,royalties) => {

  // https://staging.api.tzkt.io/v1/bigmaps/522/keys?sort.desc=id&select=key,value&offset=0&limit=10
  // limit can be up to 1000
  // default is in ascending order
  // {"key":"152","value":{"issuer":"tz1UBZUkXpKGhYsP5KtzDNqLLchwF4uHrGjw","royalties":"100"}}
  let res = await axios.get("https://staging.api.tzkt.io/v1/bigmaps/522/keys?sort.desc=id&select=key,value&limit=20&offset=" + counter)
  .then(res => res.data)
  res = await res.map(async e => {

  try {
    console.log(e.key)
    await royalties.insertOne({
      token_id: e.key,
      creator: e.value.issuer,
      royalties: parseInt(e.value.royalties)/1000
    })
    return true
  } catch (err) {
    console.log('err', e.key, err)
    return false 
  }
})

  var promise = Promise.all(res.map(e => e))

  promise.then(async (results) => {
    if (!results.every( e => e === false)) {
      await getRoyalties(arr, counter + 20, royalties)
    }
  })
  console.log('end')
  return [arr, ...res]

}

const getFeed = async (arr, counter, objkts) => {

  // gets latest objkts

  let res = await axios.get("https://api.better-call.dev/v1/contract/mainnet/KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton/tokens?offset=" + counter).then(res => res.data)

  res = await res.map(async e => {

    // fails on unique keys

    try {
      console.log(e.token_id)
      await objkts.insertOne(e)
      return true
    } catch (err) {
      //console.log('err', e.token_id, err)
      return false
    }

  })

  var promise = Promise.all(res.map(e => e))

  promise.then(async (results) => {
    if (!results.includes(false)) {
      await getFeed(arr, counter + 10, objkts)
    }
  })
  console.log('end')
  return [arr, ...res]

}

const insertFeed = async () => {
  await client.connect()
  const database = client.db('OBJKTs-DB')
  const objkts = database.collection('metadata')
  //await objkts.createIndex( { 'token_id' : 1 }, { unique: true } )
  await getFeed([], 0, objkts)
}

const insertRoyalties = async () => {
  await client.connect()
  const database = client.db('OBJKTs-DB')
  const royalties = database.collection('royalties')
  //await royalties.createIndex( { 'token_id' : 1 }, { unique: true } )
  await getRoyalties([], 0, royalties)
}

const insertTokenOwners = async () => {
  await client.connect()
  const database = client.db('OBJKTs-DB')
  const owners = database.collection('owners')
  //await owners.createIndex( { 'token_id' : 1, 'owner_id' : 1 }, { unique: true } )
  //await owners.createIndex( { 'owner_id' : 1 } )
  await getOwners([], 0, owners)
}

const insertTokenCurationBalance = async () => {
  await client.connect()
  const database = client.db('OBJKTs-DB')
  const objkts = database.collection('metadata')
  await getTokenCurationBalance([], 0, objkts)
}

//insertFeed()
//insertRoyalties()
//insertTokenOwners()
//insertTokenCurationBalance()

module.exports.insert = async (event) => {
  await insertFeed()
  await insertRoyalties()
  await insertTokenOwners()
  await insertTokenCurationBalance()
  return {
    status : 200
  }
};
