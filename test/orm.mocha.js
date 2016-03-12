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
        text: this._text,
        number: this._number
    };

};

Dummy.prototype.deserialize = function (rowData) {

    this._id = rowData.id;
    this._text = rowData.text;
    this._number = rowData.number;

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

    it ('shoudn\'t bind class with DB schema containing id', function (done) {

        try {
            db.bindSchema(Dummy, 'dummy', { id: 'varchar(255)' });
        }
        catch (ex) {
            done();
        }

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

        db.prepareAsync('SELECT * FROM dummy').then(function (stmt) {
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

    });

    // This does not test the ORM really, but it's here to benefit
    // from the test data that's ready
    it ('traverses all rows with Database.eachAsync', function (done) {

        var rows = ['Bazinga Zero'];

        function processRow(err, row) {
            assert.isNull(err);
            assert.isObject(row);
            assert.isNumber(row.id);
            assert.isString(row.text);
            rows[row.id] = row.text;
        }

        db.eachAsync('SELECT * FROM dummy', processRow).then(function (count) {
            assert.equal(count, 4);
            assert.deepEqual(rows, ['Bazinga Zero', 'Bazinga 1', 'Bazinga 2', 'Bazinga 3', 'Bazinga 4']);
            done();
        });

    });

    it ('traverses all rows with Statement.eachAsync', function (done) {

        db.prepareAsync('SELECT * FROM dummy').then(function (stmt) {
            stmt.eachAsync().then(function (count) {
                assert.equal(count, 4);
                done();
            });
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

    it ('correctly stores object updates', function (done) {

        // Object with id 2 should still be cached from previous unit test
        Dummy.getById(2).then(function (dd) {
            dd._number = 90210;
            dd.save().then(function () {
                // Verify the content fetched from db
                Dummy.get('SELECT * FROM dummy WHERE id = ?', 2).then(function (d) {
                    assert.isObject(d);
                    assert.isNumber(d._id);
                    assert.equal(d._id, 2);
                    assert.equal(d._text, 'Bazinga 2');
                    assert.equal(d._number, 90210);
                    done();
                });
            });
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

    it ('handles assigned value of id', function (done) {

        var d = new Dummy();

        // By doing this, I'm am assigning an id that does not exist in DB
        // ergo, the UPDATE command will fail
        d.deserialize({ id: 123456, text: 'Bazinga 123456' });

        d.save().then(function (ds) {
            assert.isObject(ds);
            assert.isNumber(ds._id);
            assert.equal(ds._id, 123456);
            assert.equal(ds._text, 'Bazinga 123456');
            done();
        });

    });

    it ('should correctly handle object deletion', function (done) {

        var dummy = new Dummy('Bazinga 5'),
            countSQL = 'SELECT count(*) AS count FROM dummy',
            rowCount;

        db.getAsync(countSQL).then(function (count) {
            rowCount = count.count;
            return dummy.delete()
        }).then(function (d) {
            // Object is not yet in the db, so nothing to be done here
            assert.isObject(d);
            assert.isUndefined(d._id);
        }).then(function () {
            // Save object and make sure it gets an ID
            return dummy.save();
        }).then(function (d) {
            assert.isObject(d);
            assert.isNumber(d._id);

            // Now delete the object
            return d.delete();
        }).then(function (d) {
            assert.isObject(d);
            assert.isNull(d._id);

            return db.getAsync(countSQL);
        }).then(function (count) {
            // Make sure count of rows is the same
            assert.equal(count.count, rowCount);
            done();
        });

    });

    it ('should correctly handle table truncation', function (done) {

        Dummy.truncate().then(function () {
            return Dummy.get('SELECT * FROM dummy');
        }).then(function (d) {
            // Nothing should be returned here
            assert.isUndefined(d);
            done();
        });

    });

});
