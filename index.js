'use strict';

var sqlite3 = require('sqlite3'),
    Database = sqlite3.Database,
    Statement = sqlite3.Statement,
    Promise = require('bluebird'),
    debug = require('debug')('sqlite3po');

// Transparently pass the SQLite module on
module.exports = sqlite3;

// --- --- --- --- --- --- --- --- --- --- --- --- --- --- --- --- --- --- ---
// Low hanging fruits (directly promisifiable methods)

Database.prototype.closeAsync = Promise.promisify(Database.prototype.close);
Database.prototype.getAsync = Promise.promisify(Database.prototype.get);
Database.prototype.allAsync = Promise.promisify(Database.prototype.all);
Database.prototype.execAsync = Promise.promisify(Database.prototype.exec);

Statement.prototype.bindAsync = Promise.promisify(Statement.prototype.bind);
Statement.prototype.resetAsync = Promise.promisify(Statement.prototype.reset);
Statement.prototype.finalizeAsync = Promise.promisify(Statement.prototype.finalize);
Statement.prototype.getAsync = Promise.promisify(Statement.prototype.get);
Statement.prototype.allAsync = Promise.promisify(Statement.prototype.all);

// --- --- --- --- --- --- --- --- --- --- --- --- --- --- --- --- --- --- ---
// Custom methods - these methods must be promisified manually
//
// run - because it is resolved with the value of `this`, not a callback parameter
// each - because it has two optional callback methods and we must replace the correct one
// prepare - because it is resolved by the original method's return value

Database.prototype.runAsync = runAsync;
Statement.prototype.runAsync = runAsync;

Database.prototype.eachAsync = eachAsync;
Statement.prototype.eachAsync = eachAsync;

Database.prototype.prepareAsync = prepareAsync;

// --- --- --- --- --- --- --- --- --- --- --- --- --- --- --- --- --- --- ---
// Add the lightweight ORM method to Database prototype

require('./orm');

// --- --- --- --- --- --- --- --- --- --- --- --- --- --- --- --- --- --- ---
// Custom method implementations

/// Returns a Promise that is resolved with executed statement
/// (i.e. the value of `this` from the SQLite callback)
function runAsync() {

    var me = this;
    var args = Array.prototype.slice.call(arguments, 0);

    return new Promise(function(resolve, reject) {
        // Recommended by SQLite documentation
        // (provide an empty array of "bind vars")
        // NOTE: This doesnt work for Statement
        // if (args.length === 1) args.push([]);

        args.push(function(err) {
            if (err) {
                reject(err);
            }
            resolve(this);
        });

        debug('Calling #run with params ' + JSON.stringify(args));
        me.run.apply(me, args);
    });

}

/// Returns a Promise that is resolved with the number of retrieved rows
/// (i.e. the value passed to the COMPLETION callback)
///
/// The ROW callback should be still provided and is normally executed.
/// If it is not provided (which frankly doesn't make any sense),
/// an empty function is passed to the `each` method.
function eachAsync() {

    var me = this;
    var args = Array.prototype.slice.call(arguments, 0);

    return new Promise(function(resolve, reject) {
        // If no row callback was provided, add an empty one
        var lastArgs = args[args.length - 1];
        if (typeof lastArgs !== 'function') {
            args.push(function(/*err, row*/) {
                // Do nothing
            });
        }

        // completion callback
        args.push(function(err, num) {
            if (err) reject(err);
            else resolve(num);
        });
        me.each.apply(me, args);

    });

}

/// Returns a Promise that is resolved with the prepared Statement
function prepareAsync() {

    var me = this;
    var args = Array.prototype.slice.call(arguments, 0);
    var statement;

    return new Promise(function(resolve, reject) {
        args.push(function(err) {
            if (err) reject(err);
            else resolve(statement);
        });

        statement = me.prepare.apply(me, args);
    });

}
