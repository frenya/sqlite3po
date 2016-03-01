[![Build Status](https://travis-ci.org/frenya/sqlite3po.svg?branch=master)](https://travis-ci.org/frenya/sqlite3po)

# Extended SQLite API

This module extends SQLite3's Database and Statement classes with promise-based methods.

For every original API method (e.g. `run`) a corresponding method is added with its name
ending in Async (e.g. `runAsync`).

The returned Promise resolves to

-	the fetched row/rows - case of `getAsync` and `allAsync`
-	the executed statement - case of `runAsync`
-	number of processed rows - case of `eachAsync`

Please note: In `eachAsync` the Promise replaces the second callback to `each`. 
The first callback (row callback) should still be provided and will be invoked normally.

# Lightweight ORM

The ORM in `sqlite3po` takes a different approach than most ORM implementations do. 
In a nutshell:

-	it doesn't define your classes, it simply extends your existing classes
    with basic DML methods
-	it doesn't try to understand the mapping between your object and a db row,
    instead it lets you control the mapping by calling methods for (de)serialization (see below)
-	it doesn't create a custom set of query methods to simulate SQL,
    instead it lets you use SQL directly
    
## Bind your class with a db table

See the following code snippet

```javascript
var sqlite3 = require('sqlite3po');

// Demo constructor
function Dummy(text) {
    this._text = text;
}

db = new sqlite3.Database(':memory:');
db.on('open', function () {
    db.bindSchema(Dummy, 'dummy', { text: 'varchar(255)' }).then(function () {
        // Dummy class is now bound to the "dummy" table in SQLite
        // If "dummy" table didn't exist, it was created
    });
});
```

The `bindSchema(Class, tableName, tableAttributes)` method actually does a couple of things:

-	it creates a table with the given name if it doesn't already exist
    -	the created table has all the attributes defined in the `tableAttributes` parameter
    -	plus an attribute `id` which is an `integer primary key` field, i.e. autoincremented integer
-	it creates prepared statements for INSERT, UPDATE and DELETE queries
-	it extends your class with the API methods (see below)
-	it creates an empty cache of fetched objects so that there's always only one instance of `Class`
    with a given `id`
    
Please note: `bindSchema` will throw and exception if `tableAttributes` contains a property named `id`!

## Serialization

Serialization refers to the process of creating a db record from an instance of your class.

You are responsible for having a `serialize` method in your class's prototype. The method is expected to
be synchronous and should return an object with property names matching the db table's columns (including
the `id` column). Its implementation will be fairly straightforward in most cases.

```javascript
Dummy.prototype.serialize = function () {
    return {
        id: this._id,
        text: this._text
    };
};
```

This method is called any time `sqlite3po` needs to updated the database. No arguments are passed to it.

## Deserialization

Serialization refers to the process of creating an instance of your class from a db record.

You are responsible for having a `deserialize` method in your class's prototype. The method can be
asynchronous and has to return either `this` or a Promise that will eventually resolve to `this`.

```javascript
Dummy.prototype.deserialize = function (rowData) {
    this._id = rowData.id;
    this._text = rowData.text;
    return this;
};
```
    
The method is called any time new data is fetched from database. It receives two arguments. The first 
argument is always an object containing the fetched row. 

The second argument will be *truthy* when
only the `id` property should be updated and you can (but don't have to) ignore the rest.

Please note: The `rowData` argument provided to the `deserialize` method represents a row returned by the
query you sent to one of the API methods. In simple cases like `Dummy.get('SELECT * FROM dummy')` it will
match the table attributes exactly. But since you have the freedom to execute even the most complicated
queries, your `deserialize` method should be able to handle anything you send it way!

## Querying

Your **class** will be extended with the following methods

-	`get(queryString, [bindVariables])` - runs `db.getAsync` with the same arguments and returns a Promise
    that will eventually resolve to an instance of your class corresponding to the retrieved row
-	`getById(id)` - first checks the object cache and if it finds the object there, returns a resolved
    promise directly, otherwise calls the `get` method with appropriate sql statement. This method is
    primarily intended for fast and easy traversing of to-one relations.
    If, for some reason, you want to force the fetch from db, use the `get` method instead.
-	`all(queryString, [bindVariables])` - runs `db.allAsync` with the same arguments and returns a Promise
    that will eventually resolve to an array of instances of your class corresponding to the retrieved rows
-	`releaseAll` - empties the object cache (see `release`)
-	`truncate` - deletes all rows from the table

```javascript
Dummy.get('SELECT * FROM dummy').then(function (d) {
    console.log(d);
    // { id: 1, text: 'Bazinga' }
});
```

Please note: Since version 1.1.0, you can also pass an instance of Statement as first argument to `get` and `all`

```javascript
var stmt = db.prepare('SELECT * FROM dummy WHERE id = ?');

Dummy.get(stmt, 1).then(function (d) {
	console.log(d);
	// { id: 1, text: 'Bazinga' }
});
```


## Saving / Deleting

Your class **instances** will be extended with the following methods

-   `save()` - serializes the instance and depending on the presence or absence of the `id` field
    either inserts or updates the db record. Returns a Promise that will eventually resolve `this`
-   `delete()` - deleted the db record and calls `deserialize` with the `id` field set to `null`
-   `release()` - removes the instance from object cache. By doing this the next `get` or `getById`
    will create and return a new instance for the `id`


```javascript
var d = new Dummy('Bazinga');
d.save().then(function () {
    console.log(d);
    // { id: 1, text: 'Bazinga' }
});
```

Please note: the deletion doesn't destroy the instance at all, just disconnects it from the db record.

## Caching

Every class has an object cache to make sure there's always only one instance for a given database row.
