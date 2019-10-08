/*
    ***** BEGIN LICENSE BLOCK *****

    Copyright © 2019 Corporation for Digital Scholarship
                     Vienna, Virginia, USA
                     http://digitalscholar.org/

    This file is part of Zotero.

    Zotero is free software: you can redistribute it and/or modify
    it under the terms of the GNU Affero General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    Zotero is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public License
    along with Zotero.  If not, see <http://www.gnu.org/licenses/>.

    ***** END LICENSE BLOCK *****
*/

Zotero.ExpressionsOfConcern = {
	_prefObserverRegistered: false,
	_initialized: false,

	FLAG: {
		NORMAL: 0,
		HIDDEN: 1,
	},


	init: async function () {
		this._resetState();

		if (!this._prefObserverRegistered) {
			Zotero.Prefs.registerObserver('expressionsOfConcern.enabled', this._handlePrefChange.bind(this));
			this._prefObserverRegistered = true;
		}

		if (!Zotero.Prefs.get('expressionsOfConcern.enabled')) {
			return;
		}

		const queryString = "CREATE TABLE IF NOT EXISTS expressionsOfConcern (\nitemID INTEGER PRIMARY KEY, \ndata text, \nFOREIGN KEY (itemID) REFERENCES items(itemID)on delete cascade )";
		await Zotero.DB.queryAsync(queryString);

		try {
			const queryString = "ALTER TABLE expressionsOfConcern ADD COLUMN flag INT DEFAULT 0";
			await Zotero.DB.queryAsync(queryString);
		} catch (error) {
			Zotero.debug("Error while altering ExpressionsOfConcern table: " + error.toString());
		}

		/**
		 * TODO: Load up all items and look for expressions of concern here
		 * 		- call get all items
		 * 		- look into the items for url fields
		 * 		- look into the dom
		 * 		- extract expressions of concerns
		 * 		- cache them into a file ?
		 */
		const items = await this.lookupExpressionsOfConcernForItems();

		if (items) {
			this.scrapeExpressionsOfConcern(items);
		}

		let expressionsOfConcern = await this._getEntries();

		for (let expressionOfConcern of expressionsOfConcern) {
			this._expressionsOfConcern.set(expressionOfConcern.itemID, expressionOfConcern.flag);
		}

		/**
		 * Idea after everything basic functionality works:
		 *        - Setup a Database with a local service which scrapes PubMed and other pages for publications with expressions of concern
		 *        - Store scraping processes into tables
		 *        - Have some kind of hash which determines the version of the database
		 *        - Request the Hash form the database and compare the local cache file hash with it
		 *        - Get new Database if they do not match !
		 */

		this._initialized = true;
	},

	_resetState: function () {
		this._initialized = false;
		this._expressionsOfConcern = new Map();
		this._expressionsOfConcernByLibrary = {};
	},

	_handlePrefChange: async function () {
		if (Zotero.Prefs.get('expressionsOfConcern.enabled')) {
			await this.init();
		} else {
			if (this._notifierID) {
				Zotero.Notifier.unregisterObserver(this._notifierID);
				delete this._notifierID;
			}

			await this._removeAllEntries();
			this._resetState();
		}
	},

	/**
	 *
	 * @param itemID {string | number} primary key of the item which has an expression of concern
	 * @param data {{shortTexts: *, links: *}} data which gets stored into the expression of concern
	 * @returns {Promise<void>}
	 * @private
	 */
	_addEntry: async function (itemID, data) {
		const queryString = "INSERT OR IGNORE INTO expressionsOfConcern (itemID, data) VALUES (?, ?)";
		await Zotero.DB.queryAsync(queryString, [itemID, data]);
	},

	/**
	 *
	 * @param itemID {number} primary key of the item who's expression of concern should get updated
	 * @param newData {string[]} new content of the expression of concern
	 * @returns {Promise<void>}
	 * @privates
	 */
	_updateEntry: async function (itemID, newData) {
		const currentExpressionOfConcern = await this.getEntryData();
		const queryString = "UPDATE expressionsOfConcern SET itemID=?, data=? WHERE itemID=? VALUES (?, ?, ?)";
		await Zotero.DB.queryAsync(queryString, [itemID, JSON.stringify(newData), itemID]);
	},

	/**
	 *
	 * @param item {Zotero.Item} primary key of the item for which its expression of concern should be retrieved
	 * @returns {Promise<void>}
	 */
	getEntryData: async function (itemID) {
		const queryString = "SELECT data FROM expressionsOfConcern WHERE itemID=?";
		const expressionOfConcernData = await Zotero.DB.valueQueryAsync(queryString, itemID);

		if (!expressionOfConcernData) {
			return false;
		}

		return JSON.parse(expressionOfConcernData);
	},

	_getEntries: async function () {
		const queryString = "SELECT * FROM expressionsOfConcern";
		let expressionsOfConcern = await Zotero.DB.queryAsync(queryString);

		return expressionsOfConcern;
	},

	_removeEntry: async function (itemID) {
		const queryString = "DELETE FROM expressionsOfConcern WHERE itemID=?";
		await Zotero.DB.queryAsync(queryString, itemID);

		await Zotero.Notifier.trigger("trash", "expressionOfConcern", [itemID]);
	},

	/**
	 * crops the hostname and removes the part which will most likely be the ref
	 * @param sourceLink {string} full hostname of the item
	 * @returns {string}
	 * @private
	 */
	_getHostname: function (sourceLink) {
		let hostnameArray = sourceLink.split('/');
		let refPart = '/' + hostnameArray[hostnameArray - 2] + hostnameArray[hostnameArray.length - 1];
		let hostname = sourceLink.replace(refPart, '');

		return hostname;
	},

	_removeAllEntries: async function () {
		let queryString = "SELECT itemID FROM expressionsOfConcern";
		let itemIDs = await Zotero.DB.queryAsync(queryString);

		if (!itemIDs.length) {
			return;
		}

		await Zotero.DB.queryAsync("delete from expressionsOfConcern");
		this._expressionsOfConcern.clear();

		await Zotero.Notifier.trigger("trash", "expressionOfConcern", itemIDs);
	},

	/**
	 *
	 * @param item { Zotero.Item } ItItemem which will be checked for expressions of concerns
	 * @returns {boolean}
	 */
	hasExpressionsOfConcern: function (item) {
		let expressionOfConcern = this._expressionsOfConcern.has(item.id);

		if (!expressionOfConcern) {
			return false;
		}

		return true;
	},

	/**
	 * inconsistency in database zotero stores path urls as extensions even though it belongs to the root item
	 * Query is not working
	 * @returns {Promise<void>}
	 */
	lookupExpressionsOfConcernForItems: async function () {
		const queryString = `SELECT items.itemID, itemDataValues.value
                             FROM items
                                      LEFT JOIN itemTypeFields ON items.itemTypeID = itemTypeFields.itemTypeID
                                      LEFT JOIN itemData ON itemData.fieldID = itemTypeFields.fieldID
                                      LEFT JOIN itemAttachments ON itemAttachments.parentItemID = items.itemID AND
																   itemAttachments.itemID = itemData.itemID
                                      LEFT JOIN itemDataValues ON itemDataValues.valueID = itemData.valueID
                             WHERE itemTypeFields.fieldID = 1
                               AND itemAttachments.contentType <> 'application/pdf'`;
		const filteredItems = await Zotero.DB.queryAsync(queryString);
		return filteredItems;
	},

	/**
	 * inconsistency in database zotero stores path urls as extensions even though it belongs to the root item
	 * Query is not working
	 * @returns {Promise<void>}
	 */
	lookupExpressionsOfConcernForNewItem: async function () {
		const queryString = `SELECT max(items.itemID), itemDataValues.value
                             FROM items
                                      LEFT JOIN itemTypeFields ON items.itemTypeID = itemTypeFields.itemTypeID
                                      LEFT JOIN itemData ON itemData.fieldID = itemTypeFields.fieldID
                                      LEFT JOIN itemAttachments ON itemAttachments.parentItemID = items.itemID AND
                                                                   itemAttachments.itemID = itemData.itemID
                                      LEFT JOIN itemDataValues ON itemDataValues.valueID = itemData.valueID
                             WHERE itemTypeFields.fieldID = 1
                               AND itemAttachments.contentType <> 'appliation/pdf'`;
		const filteredItem = await Zotero.DB.queryAsync(queryString);
		return filteredItem;
	},

	/**
	 *
	 * @param items {[{itemID: string, value: string}]}
	 * @returns {Promise<void>}
	 */
	scrapeExpressionsOfConcern: async function (items) {
		let promises = [];
		for (let item of items) {
			promises.push(Zotero.HTTP.request("GET", item.value, {})
				.then((response) => {
					let htmlDoc = response.responseXML;

					if (!htmlDoc) {
						var parser = Components.classes["@mozilla.org/xmlextras/domparser;1"]
							.createInstance(Components.interfaces.nsIDOMParser);
						htmlDoc = parser.parseFromString(response.responseText, "text/html");
					}

					let mainContent = htmlDoc.getElementById('maincontent');
					let errorList = Zotero.Utilities.xpath(mainContent, '//div[@class="err"]');

					let headers = Zotero.Utilities.xpath(errorList, 'h3');
					let links = [];
					let notices = [];
					if (this.containsExpressionsOfConcern(headers)) {
						for (let ul of errorList) {
							let linkList = Zotero.Utilities.xpath(ul, 'ul/li[@class="comments"]/a');

							for (let i = 0; i < linkList.length; i++) {
								let ref = linkList[i].getAttribute('ref');
								if (ref.includes('type=expressionofconcernin')) {
									notices.push(linkList[i].innerHTML);
									let expressionOfConcernLink = linkList[i].href;

									if (!expressionOfConcernLink.includes('http')) {
										expressionOfConcernLink = this._getHostname(item.value) + linkList[i].href;
									}

									links.push(expressionOfConcernLink);
								}
							}
						}

						let data = {
							links: links,
							notices: notices
						};
						this._addEntry(item.itemID, JSON.stringify(data));
					}
				}).catch((error) => {
					Zotero.debug("Error while retrieving document: " + error + "\n\n");
				})
			);
		}

		Zotero.Promise.all(promises);
	},

	/**
	 * Simple function to check if an item contains expression of concern information
	 * @param headerList {HTMLElement} the div which contains the errors in the html dom
	 * @returns {boolean} returns true of expressions of concerns are included in the item
	 */
	containsExpressionsOfConcern: function (headerList) {
		for (let header of headerList) {
			if (header.innerHTML.toLowerCase().includes('expression of concern in')) {
				return true;
			}
		}

		return false;
	}
};
