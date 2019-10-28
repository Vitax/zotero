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

		const queryString = "CREATE TABLE IF NOT EXISTS expressionsOfConcern (itemID INTEGER PRIMARY KEY, data text, FOREIGN KEY (itemID) REFERENCES items(itemID)on delete cascade )";
		await Zotero.DB.queryAsync(queryString);

		try {
			const queryString = "ALTER TABLE expressionsOfConcern ADD COLUMN flag INT DEFAULT 0";
			await Zotero.DB.queryAsync(queryString);
		}
		catch (error) {
			Zotero.debug("Error while altering ExpressionsOfConcern table: " + error.toString());
		}

		Zotero.Notifier.registerObserver(this, ['item', 'group'], 'expressionOfConcern', 20);

		/**
		 * TODO: Load up all items and look for expressions of concern here
		 *        - call get all items
		 *        - look into the items for url fields
		 *        - look into the dom
		 *        - extract expressions of concerns
		 */
		const items = await this.lookupExpressionsOfConcernItems();
		if (items) {
			this.scrapeExpressionsOfConcern(items);
		}

		let expressionsOfConcern = await this._getEntries();

		for (let row of expressionsOfConcern) {
			this._expressionsOfConcern.set(row.itemID, row.flag);
			if (!row.deleted && row.flag !== this.FLAG.HIDDEN) {
				if (!this._expressionsOfConcernByLibrary[row.libraryID]) {
					this._expressionsOfConcernByLibrary[row.libraryID] = new Set();
				}

				this._expressionsOfConcernByLibrary[row.libraryID].add(row.itemID);
			}
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
		this._queuedItemIDs = new Set();
		this._expressionsOfConcern = new Map();
		this._expressionsOfConcernByLibrary = {};
		this._librariesWithExpressionsOfConcern = new Set();
	},

	_handlePrefChange: async function () {
		if (Zotero.Prefs.get('expressionsOfConcern.enabled')) {
			await this.init();
		}
		else {
			if (this._notifierID) {
				Zotero.Notifier.unregisterObserver(this._notifierID);
				delete this._notifierID;
			}

			await this._removeAllEntries();
			this._resetState();
		}
	},

	/**
	 * returns the PubMed url
	 * @param refString {string}
	 * @returns {string}
	 * @private
	 */
	_getHostname: function (refString) {
		let hostname = '';

		if (refString.includes('pubmed')) {
			hostname = "https://www.ncbi.nlm.nih.gov";
		}
		return hostname;
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
		this._expressionsOfConcern.set(itemID, this.FLAG.NORMAL);
		this._queuedItemIDs.add(itemID);
		await Zotero.DB.queryAsync(queryString, [itemID, JSON.stringify(data)]);
	},


	/**
	 *
	 * @param itemID {number} primary key of the item who's expression of concern should get updated
	 * @param newData {string[]} new content of the expression of concern
	 * @returns {Promise<void>}
	 * @privates
	 */

	_updateEntry: async function (itemID, newData) {
		const queryString = "UPDATE expressionsOfConcern SET itemID=?, data=? WHERE itemID=? VALUES (?, ?, ?)";
		await Zotero.DB.queryAsync(queryString, [itemID, JSON.stringify(newData), itemID]);
	},

	/**
	 *
	 * @param item {string} primary key of the item for which its expression of concern should be retrieved
	 * @returns {Promise<Object>}
	 */
	getEntry: async function (itemID) {
		const expressionOfConcernCopy = {};
		const queryString = "SELECT itemID, data, flag FROM expressionsOfConcern WHERE itemID=?";
		const expressionOfConcern = await Zotero.DB.rowQueryAsync(queryString, itemID);

		if (!expressionOfConcern) {
			return false;
		}

		Object.assign(expressionOfConcern, expressionOfConcernCopy);
		expressionOfConcernCopy.data = JSON.parse(expressionOfConcern.data);

		return expressionOfConcernCopy;
	},

	_getEntries: async function () {
		const queryString = `SELECT expressionsOfConcern.itemID, expressionsOfConcern.flag, items.libraryID, deletedItems.itemID IS NOT NULL as deleted
							 FROM expressionsOfConcern
							 JOIN items ON expressionsOfConcern.itemID = items.itemID
							 LEFT JOIN deletedItems ON items.itemID = deletedItems.itemID`;
		let expressionsOfConcern = await Zotero.DB.queryAsync(queryString);

		return expressionsOfConcern;
	},

	/**
	 *
	 * @param itemID
	 * @param libraryID
	 * @returns {Promise<void>}
	 * @private
	 */
	_removeEntry: async function (itemID, libraryID) {
		this._expressionsOfConcern.delete(itemID);
		this._expressionsOfConcernByLibrary[libraryID].delete(itemID);
		this._updateLibraryExpressionsOfConcern(libraryID);

		const queryString = "DELETE FROM expressionsOfConcern WHERE itemID=?";
		await Zotero.DB.queryAsync(queryString, itemID);

		await Zotero.Notifier.trigger("trash", "expressionOfConcern", [itemID]);
	},

	/**
	 *
	 * @returns {Promise<void>}
	 * @private
	 */
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

	_updateEntryFlag: async function (itemID, newFlag) {
		this._expressionsOfConcern.set(itemID, newFlag);
		const queryString = "UPDATE expressionsOfConcern SET flag=? WHERE itemID=?";
		await Zotero.DB.queryAsync(queryString, [itemID, newFlag]);
		await Zotero.Notifier.trigger('modify', 'item', [itemID]);
	},

	checkQueuedItemsInternal: async function() {
		await this._checkQueuedItems;
	},

	_checkQueuedItems: Zotero.Utilities.debounce(async function () {
		let itemsToShowABannerFor = [];

		for (let item of this._queuedItemIDs) {
			if (this._expressionsOfConcern.has(item)) {
				itemsToShowABannerFor.push(item);
			}
		}
		if (!itemsToShowABannerFor.length) {
			return;
		}

		this._showAlert(itemsToShowABannerFor);
	}, 1000),

	/**
	 *
	 * @param libraryID
	 * @returns {Promise<boolean>}
	 */
	libraryHasExpressionsOfConcern: async function (libraryID) {
		if (this._expressionsOfConcernByLibrary[libraryID] && this._expressionsOfConcernByLibrary[libraryID].size) {
			return true;
		}

		return false;
	},

	/**
	 *
	 * @param itemID
	 * @returns {Promise<void>}
	 */
	hideExpressionOfConcern: async function (itemID) {
		this._updateEntryFlag(itemID, this.FLAG.HIDDEN);
	},

	/**
	 *
	 * @param itemID
	 * @param libraryID
	 * @returns {Promise<void>}
	 * @private
	 */
	_addEntryToExpressionsOfConcernLibrary: async function (itemID, libraryID) {
		if (!this._expressionsOfConcernByLibrary[libraryID]) {
			this._expressionsOfConcernByLibrary[libraryID] = new Set();
		}

		this._expressionsOfConcernByLibrary[libraryID].add(itemID);
		this._updateLibraryExpressionsOfConcern(libraryID);
	},

	/**
	 *
	 * @param itemID
	 * @param libraryID
	 * @returns {Promise<void>}
	 * @private
	 */
	_removeEntryFromExpressionsOfConcernLibrary: async function (itemID, libraryID) {
		if (!this._expressionsOfConcernByLibrary[libraryID]) {
			return;
		}

		this._expressionsOfConcernByLibrary[libraryID].delete(itemID);
		this._updateLibraryExpressionsOfConcern(libraryID);
	},

	/**
	 *
	 * @param libraryID
	 * @private
	 */
	_resetExpressionsOfConcernLibrary: function (libraryID) {
		delete this._librariesWithExpressionsOfConcern[libraryID];
		this._updateLibraryExpressionsOfConcern(libraryID);
	},

	_updateLibraryExpressionsOfConcern: async function (libraryID) {
		let previous = this._librariesWithExpressionsOfConcern.has(libraryID);
		let current = this.libraryHasExpressionsOfConcern(libraryID);

		if (Zotero.Libraries.exists(libraryID) && (previous !== current || Zotero.Utilities.Internal.getVirtualCollectionStateForLibrary(libraryID, "expressionsOfConcern"))) {
			let promises = [];
			for (let zoteroPane of Zotero.getZoteroPanes()) {
				promises.push(zoteroPane.setVirtual(libraryID, "expressionsOfConcern", current));
				zoteroPane.hideExpressionsOfConcernBanner();
			}

			await Zotero.Promise.all(promises);
		}

		if (current) {
			this._librariesWithExpressionsOfConcern.add(libraryID);
		}
		else {
			this._librariesWithExpressionsOfConcern.delete(libraryID);
		}
	},

	/**
	 *
	 * @param itemsWithExpressionsOfConcern {[{itemID: string, value: string}]}
	 * @returns {Promise<void>}
	 * @private
	 */
	_showAlert: async function (itemsWithExpressionsOfConcern) {
		this._queuedItemIDs.clear();
		// Don't show banner for items in the trash
		let items = await Zotero.Items.getAsync(itemsWithExpressionsOfConcern);
		items = items.filter(item => !item.deleted);
		if (!items.length) {
			return;
		}

		Zotero.Prefs.set('expressionsOfConcern.recentItems', JSON.stringify(items.map(item => item.id)));
		this._queuedItemIDs.clear();
		let zoteroPane = Zotero.getActiveZoteroPane();
		if (zoteroPane) {
			await zoteroPane.showExpressionsOfConcernBanner();
		}
	},


	/**
	 *
	 * @param action
	 * @param type
	 * @param ids
	 * @param extraData
	 * @returns {Promise<void>}
	 */
	notify: async function (action, type, ids, extraData) {
		if (!this._initialized) {
			return;
		}

		if (type === "group") {
			if (action === 'delete') {
				for (let libraryID of ids) {
					this._resetExpressionsOfConcernLibrary(libraryID);
				}
			}
		}

		if (action === "add") {
			for (let itemID of ids) {
				let item = await this.lookupExpressionsOfConcernItem(itemID);
				if (!item) {
					return;
				}

				await this.scrapeExpressionsOfConcern([item]).then(() => {
					this._checkQueuedItems();
				});
			}
		}

		if (action === "modify") {
			for (let itemID of ids) {
				let item = Zotero.Items.get(itemID);
				let expressionOfConcern = await this.lookupExpressionsOfConcernItem(itemID);
				if (!expressionOfConcern) {
					return;
				}

				await this.scrapeExpressionsOfConcern([expressionOfConcern]).then(() => {
					this._checkQueuedItems();
				});

				let flag = this._expressionsOfConcern.get(itemID);
				if (flag !== undefined && (flag === this.FLAG.HIDDEN && item.deleted)) {
					this._removeEntryFromExpressionsOfConcernLibrary(itemID, item.libraryID);
				}
				else {
					this._addEntryToExpressionsOfConcernLibrary(itemID, item.libraryID);
				}
			}
		}

		if (action === "deleted") {
			for (let itemID of ids) {
				this._removeEntry(itemID, extraData[itemID].libraryID);
			}
		}
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
	lookupExpressionsOfConcernItems: async function () {
		const queryString = `SELECT items.itemID, itemDataValues.value
							FROM items
							LEFT JOIN itemTypeFields 
								ON items.itemTypeID = itemTypeFields.itemTypeID	
							LEFT JOIN itemTypes 
								ON items.itemTypeID = itemTypes.itemTypeID
							LEFT JOIN itemData 
								ON itemData.fieldID = itemTypeFields.fieldID
							LEFT JOIN fields 
								ON fields.fieldID = itemData.fieldID
							LEFT JOIN itemAttachments 
								ON itemAttachments.parentItemID = items.itemID 
								AND	itemAttachments.itemID = itemData.itemID
							LEFT JOIN itemDataValues 
								ON itemDataValues.valueID = itemData.valueID
							WHERE itemTypes.typeName <> 'attachment'
								AND fields.fieldName = 'url'
								AND itemAttachments.contentType <> 'application/pdf' `;
		const filteredItems = await Zotero.DB.queryAsync(queryString);
		return filteredItems;
	},

	/**
	 * Returns the most recent item which has a url from the DB
	 * @returns {Promise<{itemID: string, value: string}>}
	 */
	lookupExpressionsOfConcernItem: async function (itemID) {
		const queryString = `SELECT items.itemID, itemDataValues.value
							FROM items
							LEFT JOIN itemTypeFields 
								ON items.itemTypeID = itemTypeFields.itemTypeID	
							LEFT JOIN itemTypes 
								ON items.itemTypeID = itemTypes.itemTypeID
							LEFT JOIN itemData 
								ON itemData.fieldID = itemTypeFields.fieldID
							LEFT JOIN fields 
								ON fields.fieldID = itemData.fieldID
							LEFT JOIN itemAttachments 
								ON itemAttachments.parentItemID = items.itemID 
								AND	itemAttachments.itemID = itemData.itemID
							LEFT JOIN itemDataValues 
								ON itemDataValues.valueID = itemData.valueID
							WHERE itemTypes.typeName <> 'attachment'
								AND fields.fieldName = 'url'
								AND itemAttachments.contentType <> 'application/pdf'
								AND items.itemID = ?`;
		return await Zotero.DB.rowQueryAsync(queryString, [itemID]);
	},

	/**
	 *
	 * @param items {[{itemID: string, value: string}]}
	 * @returns {Promise<Object>}
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
					if (!mainContent) {
						return;
					}

					let errorList = Zotero.Utilities.xpath(mainContent, '//div[@class="err"]');

					let headers = Zotero.Utilities.xpath(errorList, 'h3');
					let links = [];
					let notices = [];
					if (this.containsExpressionsOfConcern(headers)) {
						for (let ul of errorList) {
							let linkList = Zotero.Utilities.xpath(ul, 'ul/li[@class="comments"]/a');

							for (let link of linkList) {
								let ref = link.getAttribute('ref');
								if (ref.includes('type=expressionofconcernin')) {
									notices.push(link.innerHTML);
									let expressionOfConcernLink = link.href;

									if (!expressionOfConcernLink.includes('http')) {
										expressionOfConcernLink = this._getHostname(item.value) + link.href;
									}

									links.push(expressionOfConcernLink);
								}
							}
						}

						let data = {
							links: links,
							notices: notices
						};

						this._addEntry(item.itemID, data);
					}
				})
				.catch((error) => {
					Zotero.debug("Error while retrieving document: " + error + "\n\n");
				})
			);
		}

		await Zotero.Promise.all(promises);
	},

	/**
	 * Simple function to check if an item contains expression of concern information
	 * @param headerList {HTMLElement} the div which contains the errors in the html dom
	 * @returns {boolean} returns true of expressions of concerns are included in the item
	 */
	containsExpressionsOfConcern: function (headerList) {
		for (let header of headerList) {
			if (header.innerHTML.toLowerCase()
				.includes('expression of concern in')) {
				return true;
			}
		}

		return false;
	}
};

