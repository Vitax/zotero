describe("ExpressionsOfConcern", function () {
	let userLibraryID;
	let window;
	let zoteroPane;
	let queuedItemStub;
	let expressionOfConcernURL = "https://www.ncbi.nlm.nih.gov/pubmed/10071907";

	before(async function () {
		userLibraryID = Zotero.Libraries.userLibraryID;
		window = await loadZoteroPane();
		zoteroPane = window.zoteroPane;

		queuedItemStub = sinon.stub(Zotero.ExpressionsOfConcern, 'checkQueuedItems').callsFake(() => {
			return Zotero.ExpressionsOfConcern._checkQueuedItemsInternal();
		});
	});

	beforeEach(async function () {
		let ids = await Zotero.DB.columnQueryAsync("SELECT itemID FROM expressionsOfConcern");

		if (ids.length) {
			await Zotero.Items.erase(ids);
		}
	});

	afterEach(async function () {
		window.document.getElementById('expressions-of-concern-items-close').click();
		queuedItemStub.resetHistory();
	});

	after(async function () {
		window.close();
		queuedItemStub.restore();

		let ids = await Zotero.DB.columnQueryAsync("SELECT itemID FROM expressionsOfConcern");

		if (ids.length) {
			await Zotero.Items.erase(ids);
		}
	});

	async function createItemWithExpressionOfConcern(options = {}) {
		let itemObject = {
			itemType: "journalArticle"
		};

		Object.assign(itemObject, options);

		let item = createUnsavedDataObject('item', itemObject);

		if (Zotero.DB.inTransaction) {
			await item.save();
		}
		else {
			await item.saveTx();
		}

		let attachmentObject = {
			itemType: "attachment",
			url: expressionOfConcernURL,
			parentID: item.id
		};

		let attachment = createUnsavedDataObject('item', attachmentObject);

		if (Zotero.DB.inTransaction) {
			await attachment.save();
		}
		else {
			await attachment.saveTx();
		}

		while (!queuedItemStub.called) {
			await Zotero.Promise.delay(50);
		}

		await queuedItemStub.returnValues[0];
		queuedItemStub.resetHistory();

		return item;
	}

	function bannerShown() {
		let container = window.document.getElementById('expressions-of-concern-items-container');

		if (container.getAttribute('collapsed') == 'true') {
			return false;
		}

		if (!container.hasAttribute('collapsed')) {
			return true;
		}

		throw new Error("'collapsed' attribute not found");
	}

	describe("shouldFindExpressionOfConcernForItem()", function () {
		it("should find and add an expression of concern for item", async function () {
			let item = await createItemWithExpressionOfConcern();
			await Zotero.Promise.delay(100);

			let expressionOfConcernBox = window.document.getElementById('expression-of-concern-box');
			assert.isTrue(expressionOfConcernBox.hidden);

			// Lookup for new items to check expression of concern
			let eoc = await Zotero.ExpressionsOfConcern.lookupUrlForItem(item.id);
			console.log('eoc value: ', eoc.value)
			await Zotero.ExpressionsOfConcern.scrapeExpressionsOfConcern([eoc]);

			let exists = await Zotero.DB.queryAsync(
				`SELECT * FROM expressionsOfConcern
				 WHERE expressionsOfConcern.itemID=${item.id}`
			);

			// check if item expressionsOfConcern table contains parentID
			assert.equal(exists.length, 1);

			// check if expressionOfConcernBox is visible
			expressionOfConcernBox = window.document.getElementById('expression-of-concern-box');

			assert.isFalse(expressionOfConcernBox.hidden);
		});
	});
});
