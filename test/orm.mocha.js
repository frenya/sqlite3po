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
    
    return Promise.resolve(this);
    
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

});
