'use strict';

var sqlite3 = require('.'),
    Database = sqlite3.Database,
    Statement = sqlite3.Statement,
    Promise = require('bluebird'),
    debug = require('debug')('sqlite3po:orm');

Database.prototype.bindSchema = function (Class, table, attributes) {

    // Sanity check - make sure we can use 'id' as primary key
    if (attributes.hasOwnProperty('id')) throw new Error('Class must not contain an attribute named \'id\'');

    var db = this;
    
    debug('Binding class ' + Class + ' with table ' + table + ' with attributes ' + JSON.stringify(attributes));
    
    // --- --- --- --- --- --- --- --- --- --- --- --- --- --- --- --- --- ---
    // Main DB access and manipulation methods
    
    Class.prototype.save = function () {

        var me = this,
            rowData = me.serialize();
        
        debug('Will save data ' + JSON.stringify(rowData));

        if (rowData.id) {
            return performUpdate(rowData).then(function () {
                return me;
            });
        }
        else {
            return performInsert(rowData).then(function (stmt) {
                debug('Inserted row with rowid ' + stmt.lastID);
                
                // New row was inserted, we need to update the id
                // The only way to do it is by invoking the deserialize() method!
                rowData.id = stmt.lastID;
                
                return setCachedObject(rowData.id, me).deserialize(rowData, true);
            });
        }

    };
    
    Class.prototype.delete = function () {
        
        var me = this,
            rowData = me.serialize();

        if (rowData.id) {
            // Remove object from cache
            setCachedObject(rowData.id, undefined);
            
            // Remove row from db
            return performDelete(rowData).then(function () {
                // Unset the id (via invoking the deserialize() method)
                rowData.id = null;
                return me.deserialize(rowData, true);
            });
            
        }
        else {
            // Nothing needed, object was never stored
            return Promise.resolve(me);
        }
        
    };
    

    /**
     * Fetches one row via the given statement and returns 
     * a corresponding deserialized object.
     *
     * @param{String|Statement}sqlOrStatement The statement to execute
     *
     * NOTE: The method accepts variable number of arguments. All of them
     *       are passed on to the appropriate getAsync method.
     *       The only reason the give the first argument a name is easier type testing.
     */
    Class.get = function (sqlOrStatement) {     // Name the first argument for easier type testing

        var rowPromise = null;
        
        // If the first argument is a Statement, we have to 
        // call its getAsync method with the REMAINING arguments,
        // otherwise call db.getAsync with ALL the arguments
        if (sqlOrStatement instanceof Statement) {
            var args = Array.prototype.slice.call(arguments, 1);
            rowPromise = Statement.prototype.getAsync.apply(sqlOrStatement, args);
        }
        else {
            rowPromise = Database.prototype.getAsync.apply(db, arguments);
        }
        
        return rowPromise.then(function (row) {
            return deserialize(row);
        });

    };

    /**
     * Fetches all rows via the given statement and returns 
     * a corresponding array of deserialized objects.
     *
     * @param{String|Statement}sqlOrStatement The statement to execute
     *
     * NOTE: The method accepts variable number of arguments. All of them
     *       are passed on to the appropriate allAsync method.
     */
    Class.all = function (sqlOrStatement) {     // Name the first argument for easier type testing

        var rowPromise = null;

        // If the first argument is a Statement, we have to 
        // call its allAsync method with the REMAINING arguments,
        // otherwise call db.allAsync with ALL the arguments
        if (sqlOrStatement instanceof Statement) {
            var args = Array.prototype.slice.call(arguments, 1);
            rowPromise = Statement.prototype.allAsync.apply(sqlOrStatement, args);
        }
        else {
            rowPromise = Database.prototype.allAsync.apply(db, arguments);
        }

        return rowPromise.then(function (rows) {
            return Promise.all(rows.map(deserialize));
        });

    };
    
    Class.truncate = function () {
      
        return db.runAsync('DELETE FROM ' + table).then(function (stmt) {
            // Clear the cache completely as no objects are now valid
            Class.releaseAll();
            return stmt;
        });
        
    };
    
    Class.prototype.release = function () {

        var me = this,
            rowData = me.serialize();

        setCachedObject(rowData.id, undefined);

    };

    Class.releaseAll = function () {

        _objectCache = {};
        
    };

    // --- --- --- --- --- --- --- --- --- --- --- --- --- --- --- --- --- ---
    // Cache of fetched db objects

    var _objectCache = {};

    function getCachedObject(id) { 
        return _objectCache[id]; 
    }

    function setCachedObject(id, obj) {
        if (obj) {
            debug('Caching new ' + Class.name + ' object with rowid ' + id);
            _objectCache[id] = obj;
        }
        else {
            debug('Deleting ' + Class.name + ' object with rowid ' + id);
            delete _objectCache[id];
        }
        
        return obj;
    }

    function deserialize(rowData) {

        // Sanity check
        if (!rowData) return Promise.resolve(undefined);

        // Get object from cache or create a new one
        var obj = getCachedObject(rowData.id) || setCachedObject(rowData.id, new Class());

        // Deserialize object from row's data
        return obj.deserialize(rowData);

    }
    
    Class.getById = function (id) {
        
        // Return the cached object if ready - wrapped in promise
        var obj = getCachedObject(id);
        if (obj) return Promise.resolve(obj);
        
        // Otherwise fetch the object from db
        // (as a side-effect, object will be deserialized and cached)
        return this.get(_selectByIdSQL, { $id: id });
        
    };

    // --- --- --- --- --- --- --- --- --- --- --- --- --- --- --- --- --- ---
    // Supporting DB functions

    // Create reusable statements
    var _attributeNames = ['id'].concat(Object.getOwnPropertyNames(attributes)),
        _selectByIdSQL = ['SELECT * FROM', table, 'WHERE id = $id'].join(' '),
        _insertStatement = null, //db.prepare(insertStatementSQL(table, attributes)),
        _updateStatement = null, //db.prepare(updateStatementSQL(table, attributes)),
        _deleteStatement = null; //db.prepare(updateStatementSQL(table, attributes));

    function performInsert(rowData) {

        debug('Running statement ' + JSON.stringify(_insertStatement));
        return _insertStatement.runAsync(prepareBindVars(rowData));

    }

    function performUpdate(rowData) {

        debug('Running statement ' + JSON.stringify(_updateStatement));
        return _updateStatement.runAsync(prepareBindVars(rowData));

    }

    function performDelete(rowData) {

        debug('Running statement ' + JSON.stringify(_deleteStatement));
        return _deleteStatement.runAsync(prepareBindVars(rowData));

    }

    function prepareBindVars(rowData) {

        var bindVars = {};

        _attributeNames.forEach(function (colName) {
            if (rowData.hasOwnProperty(colName)) {
                bindVars[bindVarName(colName)] = rowData[colName];
            }
        });

        debug('Binding variables ' + JSON.stringify(bindVars));
        return bindVars;

    }

    function bindVarName(columnName) {

        return '$' + columnName;

    }

    // --- --- --- --- --- --- --- --- --- --- --- --- --- --- --- --- --- ---
    // SQL statements construction

    /*
    function createStatementSQL(table, attributes) {

        // Prepare an array of column names and bind variable names
        var colNames = Object.getOwnPropertyNames(attributes),
            colDefs = ['id INTEGER PRIMARY KEY'];

        colNames.forEach(function (colName) {
            var colDef = colName + ' ' + attributes[colName];
            var total = colDefs.push(colDef);
        });

        return ['CREATE TABLE IF NOT EXISTS ', table, ' (', colDefs.join(', '), ')'].join('');

    }
    */
    
    function createStatementBasicSQL(table /*, unused: attributes */) {

        return ['CREATE TABLE IF NOT EXISTS ' + table + ' (id INTEGER PRIMARY KEY)'].join(' ');

    }

    function createColumnStatementSequenceSQL(table, attributes) {

        var colNames = Object.getOwnPropertyNames(attributes),
            statements = [];

        colNames.forEach(function (colName) {
            statements.push(['ALTER TABLE', table, 'ADD COLUMN', colName, attributes[colName]].join(' '));
        });

        return statements;

    }

    function insertStatementSQL(table, attributes) {

        // Prepare an array of column names and bind variable names
        var colNames = Object.getOwnPropertyNames(attributes),
            bindVars = colNames.map(bindVarName);

        return ['INSERT INTO ', table, ' (', colNames.join(', '), ') VALUES (', bindVars.join(', '), ')'].join('');

    }

    function updateStatementSQL(table, attributes) {

        // Prepare an array of assignments in form col = $bindVar
        var colNames = Object.getOwnPropertyNames(attributes),
            assignments = colNames.map(function(columnName) {
                return columnName + ' = ' + bindVarName(columnName);
            });

        return ['UPDATE ', table, ' SET ', assignments.join(', '), ' WHERE id = $id'].join('');

    }

    function deleteStatementSQL(table /*, unused: attributes */) {

        return ['DELETE FROM ', table, ' WHERE id = $id'].join('');

    }

    // --- --- --- --- --- --- --- --- --- --- --- --- --- --- --- --- --- ---
    // Final initialization step

    // Create table and return
    var _createStatement = createStatementBasicSQL(table, attributes);
    debug('Running statement ' + _createStatement);
          
    return db.runAsync(_createStatement).then(function () {
        var columnStatements = createColumnStatementSequenceSQL(table, attributes);
        return Promise.all(columnStatements.map(function (sql) {
            // Adding the column may throw an error if it already exists
            // Just log them and continue
            return db.runAsync(sql).catch(function (err) { debug(err); });
        }));
    }).then(function () {
        // Now that we have the table, prepare the DML statements
        _insertStatement = db.prepare(insertStatementSQL(table, attributes));
        _updateStatement = db.prepare(updateStatementSQL(table, attributes));
        _deleteStatement = db.prepare(deleteStatementSQL(table, attributes));
        
        // The return value is irrelevant here
        return;
    });

};

