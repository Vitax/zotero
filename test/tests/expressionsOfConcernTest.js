describe("ExpressionsOfConcern", function () {
	let userLibraryID;
	let window;
	let zoteroPane;
	let queueItemStub;
	let expressionOfConcernURL = "https://www.ncbi.nlm.nih.gov/pubmed/10071907";


	before(async function () {
		userLibraryID = Zotero.Libraries.userLibraryID;
		window = await loadZoteroPane();
		zoteroPane = window.zoteroPane;

		queueItemStub = sinon.stub(Zotero.ExpressionsOfConcern, 'checkQueuedItems').callsFake(() => {
			return Zotero.ExpressionsOfConcern.checkQueuedItemsInteral();
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
		queueItemStub.resetHistory();
	});

	after(async function () {
		window.close();
		queueItemStub.restore();

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

		let attachmentObject = {};
		let attachment = createUnsavedDataObject('attachment', attachmentObject);

		attachment.setField('url', expressionOfConcernURL);
		attachment.parentID = item.id;

		await queueItemStub.returnValues[0];
		queueItemStub.resetHistory();

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

			assert.isFalse(expressionOfConcernBox.hidden);

			// Lookup for new items to check expression of concern
			let eoc = await Zotero.ExpressionsOfConcern.lookupUrlForEocs(item.id);

			await Zotero.ExpressionsOfConcern.scrapeExpressionsOfConcern([eoc]);
			let exists = await Zotero.DB.queryAsync(
				`SELECT expressionOfConcern FROM expressionsOfConcern
				 WHERE expressionOfConcern.item=${item.id}`
			);

			// check if item expressionsOfConcern table contains parentID
			assert.isTrue(exists);

			// check if expressionOfConcernBox is visible
			expressionOfConcernBox = window.document.getElementById('expression-of-concern-box');

			assert.isTrue(expressionOfConcernBox.hidden);
		});
	});
});
