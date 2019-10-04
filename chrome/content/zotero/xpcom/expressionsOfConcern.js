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

		const queryString = "create table if not exists expressionsOfConcern (\nitemID integer primary key, \ndata text, \nforeign key (itemID) references items(itemID)on delete cascade )";
		await Zotero.DB.queryAsync(queryString);

		try {
			const queryString = "alter table expressionsOfConcern add column flag int default 0";
			await Zotero.DB.queryAsync(queryString);
		} catch (error) {
			Zotero.debug("Error while altering ExpressionsOfConcern table: " + error.toString());
		}

		// TODO: Load up all items and look for expressions of concern here
		// call get all items
		// look into the items for url fields
		// look into the dom
		// extract expressions of concerns
		// cache them into a file ?
		let items = await this.lookupExpressionsOfConcernForItems();
		if (items) {
			await this.scrapeExpressionsOfConcern(items);
		}


		/**
		 * Idea after everything basic functionality works:
		 *		- Setup a Database with a local service which scrapes PubMed and other pages for publications with expressions of concern
		 *		- Store scraping processes into tables
		 *		- Have some kind of hash which determines the version of the database
		 *		- Request the Hash form the database and compare the local cache file hash with it
		 *		- Get new Database if they do not match !
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
	 * @param data {string} data which gets stored into the expression of concern
	 * @returns {Promise<void>}
	 * @private
	 */
	_addEntry: async function (itemID, data) {
		const queryString = "insert or ignore into expressionsOfConcern (itemID, data) values(?, ?)";
		await Zotero.DB.queryAsync(queryString, [itemID, JSON.stringify(data)]);
	},

	/**
	 *
	 * @param itemID {number} primary key of the item who's expression of concern should get updated
	 * @param newData {string[]} new content of the expression of concern
	 * @returns {Promise<void>}
	 * @private
	 */
	_updateEntry: async function (itemID, newData) {
		const queryString = "update expressionsOfConcern set itemID=?, data=? where itemID=? values (?, ?, ?)";
		await Zotero.DB.queryAsync(queryString, itemID, JSON.stringify(newData), itemID);
	},

	/**
	 *
	 * @param itemID {number} primary key of the item for which its expression of concern should be retrieved
	 * @returns {Promise<void>}
	 * @private
	 */
	_getEntry: async function (itemID) {
		const queryString = "select expressionOfConcern from expressionsOfConcern where itemID=?";
		await Zotero.DB.queryAsync(queryString, [itemID]);
	},

	/**
	 *
	 * @param itemID {number} primary key of the item for which its expression of concern should be retrieved
	 * @returns {Promise<void>}
	 */
	getEntry: async function (itemID) {
		await this._getEntry(itemID);
	},

	/**
	 * @returns {Promise<void>}
	 * @private
	 */
	_getEntries: async function () {
		const queryString = "select * form expressionsOfConcern";
		await Zotero.DB.queryAsync(queryString);
	},

	_removeEntry: async function (itemID) {
		const queryString = "delete from expressionsOfConcern where itemID=?";
		await Zotero.DB.queryAsync(queryString, [itemID]);

		await Zotero.Notifier.trigger("trash", "expressionOfConcern", [itemID]);
	},

	/**
	 *
	 * @param requestData {XMLDocument}
	 * @private
	 */
	_getHost: function (requestData) {
		Zotero.debug(requestData);
	},

	_removeAllEntries: async function () {
		let queryString = "select itemID from expressionsOfConcern";
		let itemIDs = await Zotero.DB.queryAsync(queryString);

		if (!itemIDs.length) {
			return;
		}

		await Zotero.DB.queryAsync("delete from expressionsOfConcern");
		this._expressionsOfConcern.clear();

		await Zotero.Notifier.trigger("trash", "expressionOfConcern", itemIDs);
	},

	/**
	 * inconsistency in database zotero stores path urls as extensions even though it belongs to the root item
	 * Query is not working
	 * @returns {Promise<void>}
	 */
	lookupExpressionsOfConcernForItems: async function () {
		const queryString = `select items.itemID, itemDataValues.value
                             from items
                                      left join itemTypeFields on items.itemTypeID = itemTypeFields.itemTypeID
                                      left join itemData on itemData.fieldID = itemTypeFields.fieldID
                                      left join itemAttachments on itemAttachments.parentItemID = items.itemID and
                                                                   itemAttachments.itemID = itemData.itemID
                                      left join itemDataValues on itemDataValues.valueID = itemData.valueID
                             where itemTypeFields.fieldID = 1
                               and itemAttachments.contentType <> 'application/pdf'`;
		let filteredItems = await Zotero.DB.queryAsync(queryString);
		return filteredItems;
	},

	/**
	 * inconsistency in database zotero stores path urls as extensions even though it belongs to the root item
	 * Query is not working
	 * @returns {Promise<void>}
	 */
	lookupExpressionsOfConcernForNewItem: async function () {
		const queryString = `select max(items.itemID), itemDataValues.value
                             from items
                                      left join itemTypeFields on items.itemTypeID = itemTypeFields.itemTypeID
                                      left join itemData on itemData.fieldID = itemTypeFields.fieldID
                                      left join itemAttachments on itemAttachments.parentItemID = items.itemID and
                                                                   itemAttachments.itemID = itemData.itemID
                                      left join itemDataValues on itemDataValues.valueID = itemData.valueID
                             where itemTypeFields.fieldID = 1
                               and itemAttachments.contentType <> 'appliation/pdf'`;
		let filteredItem = await Zotero.DB.queryAsync(queryString);
		return filteredItem;
	},

	/**
	 *
	 * @param items {[{itemID: string, value: string}]}
	 * @returns {Promise<void>}
	 */
	scrapeExpressionsOfConcern: async function (items) {
		for (let item of items) {
			await Zotero.HTTP.request("GET", item.value, {})
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
					if (this.containsExpressionsOfConcern(headers)) {
						for (let ul of errorList) {
							let linkList = Zotero.Utilities.xpath(ul, 'ul/li[@class="comments"]');
							for (let link of linkList) {
								let linkElement = parser.parseFromString(link.innerHTML, 'text/html');
								let linkTag = linkElement.getElementsByTagName('a')[0];

								let href = linkTag.getAttribute('ref');
								let data = [];
								if (href.includes('type=expressionofconcernin')) {
									let itemID = item.itemID;
									let expressionOfConcernLink = linkTag.hostname + linkTag.getAttribute('href');
									let shortText = linkTag.innerHTML;

									data.push({
										link: expressionOfConcernLink,
										shortText: shortText
									});

									this._addEntry(itemID, JSON.stringify(data));
								}
							}
						}
					}
				}).catch((error) => {
					Zotero.debug("Error while retrieving document: " + error + "\n\n");
				});
		}
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
	},

	/**
	 *
	 * @param expressionOfConcern {Zotero.ExpressionsOfConcern}
	 * @param data {{itemID: string, data: [{link: string, shortText: string}]}
	 * @private
	 */
	_expressionOfConcernShouldUpdate(expressionOfConcern, data) {

	}
};
