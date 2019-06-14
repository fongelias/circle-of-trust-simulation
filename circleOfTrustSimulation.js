// What do we want to simulate?
// How many code owners do we need per section of code?
// Take into account:
// Imperfect reviewers- they make mistakes x% of the time
// Imperfect developers- they make mistakes x% of the time
// Time for review- how long does it take to review T tasks with R reviewers?
// Time to review- how long does it take for a review to begin?

// Events
const EVENTS = {};

const EventEmitter = require('events');
const SCM = new EventEmitter(); // source control as an event emitter

// Roles
class Developer {
	constructor(scm) {
		this.scm = scm;
	}
}

class Reviewer {
	constructor(scm) {
		this.scm = scm;
	}
}

// Task
const TASK = {
	STATE: {
		TO_DO: 'todo',
		IN_PROGRESS: 'in progress',
		READY_FOR_REVIEW: 'ready for review',
		IN_REVIEW: 'in review',
		COMPLETE: 'complete'
	}
}

class Task {
	constructor() {
		this.state = TASK.STATE.TO_DO;
	}

	start() {
		if (this.state != TASK.STATE.TO_DO) {
			throw new Error('cannot transition task to in progress from ' + this.state);
		}
		
		this.state = TASK.STATE.IN_PROGRESS;
	}

}
