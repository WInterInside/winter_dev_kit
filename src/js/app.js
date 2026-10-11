"use strict";

class App {
	constructor() {
		this.exampleModule = new ExampleModule();
	}

	start() {
		this.exampleModule.init();
	}
}

new App().start();
