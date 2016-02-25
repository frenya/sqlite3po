/*global require, console, describe, it, before */
'use strict';

var assert = require('chai').assert,
    sqlite3 = require('..');

// --- --- --- --- --- --- --- --- --- --- --- --- --- --- --- --- --- --- ---
// Unit test object class

function Dummy(text) {
    
    this._text = text;
    
}

Dummy.prototype.serialize = function () {
    
    return {
        id: this._id,
        text: this._text
    };
    
};

Dummy.prototype.deserialize = function (rowData) {
    
    this._id = rowData.id;
    this._text = rowData.text;
    
    return this;
    
};

// --- --- --- --- --- --- --- --- --- --- --- --- --- --- --- --- --- --- ---
// Initial ORM setup

describe('SQLite ORM', function () {

    var db = null;

    before(function (done) {
        db = new sqlite3.Database(':memory:');
        db.on('open', function () {
            done(); 
        });
    });
    
    it ('binds class with DB schema', function (done) {
    
        db.bindSchema(Dummy, 'dummy', { text: 'varchar(255)' }).then(function () {
            assert.isFunction(Dummy.get);
            assert.isFunction(Dummy.all);
            assert.isFunction(Dummy.prototype.save);
            assert.isFunction(Dummy.prototype.delete);
            assert.isFunction(Dummy.prototype.release);
            done();
        });
        
    });
    
    it ('binds class with DB schema repeatedly', function (done) {

        db.bindSchema(Dummy, 'dummy', { text: 'varchar(255)', number: 'integer' }).then(function () {
            assert.isFunction(Dummy.get);
            assert.isFunction(Dummy.all);
            assert.isFunction(Dummy.prototype.save);
            assert.isFunction(Dummy.prototype.delete);
            assert.isFunction(Dummy.prototype.release);
            done();
        });

    });

    it ('stores unit test objects', function (done) {

        var d1 = new Dummy('Bazinga 1'),
            d2 = new Dummy('Bazinga 2'),
            d3 = new Dummy('Bazinga 3'),
            d4 = new Dummy('Bazinga 4');
        
        Promise.all([
            d1.save(),
            d2.save(),
            d3.save(),
            d4.save()
        ]).then(function (ds) {
            assert.lengthOf(ds, 4);
            ds.forEach(function (d) {
                assert.isObject(d);
                assert.isString(d._text);
                assert.isNumber(d._id);
            });
            done();
        });

    });

    it ('retrieves unit test objects', function (done) {
        
        Dummy.all('SELECT * FROM dummy').then(function (ds) {
            assert.lengthOf(ds, 4);
            ds.forEach(function (d) {
                assert.isObject(d);
                assert.isString(d._text);
                assert.isNumber(d._id);
                assert.equal(d._text, 'Bazinga ' + d._id);
            });
            done();
        });
        
    });
    
    it ('retrieves unit test objects via statement', function (done) {

        var stmt = db.prepare('SELECT * FROM dummy');
        
        Dummy.all(stmt).then(function (ds) {
            assert.lengthOf(ds, 4);
            ds.forEach(function (d) {
                assert.isObject(d);
                assert.isString(d._text);
                assert.isNumber(d._id);
                assert.equal(d._text, 'Bazinga ' + d._id);
            });
            done();
        });

    });

    it ('retrieves uncached unit test object by id', function (done) {

        Dummy.releaseAll();
        
        Dummy.getById(2).then(function (d) {
            assert.isObject(d);
            assert.isNumber(d._id);
            assert.equal(d._id, 2);
            assert.equal(d._text, 'Bazinga 2');
            done();
        });
        
    });

    it ('retrieves cached unit test object by id', function (done) {

        // Object with id 2 should still be cached from previous unit test
        // Check the debug log to verify (there should be only one "Caching" message)
        //     ✓ retrieves unit test objects
        //   sqlite3po:orm Caching new Dummy object with rowid 2 +9ms
        //     ✓ retrieves uncached unit test object by id
        //     ✓ retrieves cached unit test object by id
        Dummy.getById(2).then(function (d) {
            assert.isObject(d);
            assert.isNumber(d._id);
            assert.equal(d._id, 2);
            assert.equal(d._text, 'Bazinga 2');
            done();
        });

    });

    it ('retrieves object via prepared statement', function (done) {

        var stmt = db.prepare('SELECT * FROM dummy WHERE id = ?');
        
        Dummy.get(stmt, 3).then(function (d) {
            assert.isObject(d);
            assert.isNumber(d._id);
            assert.equal(d._id, 3);
            assert.equal(d._text, 'Bazinga 3');
            done();
        });

    });

    it ('retrieves object via sql', function (done) {

        Dummy.get('SELECT * FROM dummy WHERE id = ?', 4).then(function (d) {
            assert.isObject(d);
            assert.isNumber(d._id);
            assert.equal(d._id, 4);
            assert.equal(d._text, 'Bazinga 4');
            done();
        });

    });

});
