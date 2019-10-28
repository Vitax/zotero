describe("ExpressionsOfConcern", function () {
	let userLibraryID;
	let window;
	let zoteroPane;
	let queueItemStub;
	let expressionOfConcernURL = "https://www.ncbi.nlm.nih.gov/pubmed/23412555";


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

	afterEach(async function() {
		window.document.getElementById('expressions-of-concern-items-close').click();
		queueItemStub.resetHistory();
	})

	after(async function () {
		Zotero.HTTP.mock = null;

		await Zotero.ExpressionsOfConcern.lookupExpressionsOfConcernItem();
	});

	async function createItemWithExpressionOfConcern(options = {}) {
		let o = {
			itemType: "journalArticle"
		};

		Object.assign(o, options);

		let item = createUnsavedDataObject('item', o);
		item.setField();
	}

	function bannerShown() {
		var container = window.document.getElementById('expressions-of-concern-items-container');
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
		});
	});

});
