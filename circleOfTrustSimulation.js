// What do we want to simulate?
// How many code owners do we need per section of code?
// Take into account:
// Imperfect reviewers- they make mistakes x% of the time
// Imperfect developers- they make mistakes x% of the time
// Time for review- how long does it take to review T tasks with R reviewers?
// Time to review- how long does it take for a review to begin?
// Mistakes are only merged if both reviewers miss it

const SIM_CONFIG = {
	TASK: {
		AVG_LINES_PER_POINT: 100,
		AVG_POINTS: 5,
		REVIEWERS_PER_LINE: 300
	},
	REVIEWER: {
		ERROR_RATE: 0.05
	},
	DEVELOPER: {
		ERROR_RATE: 0.10
	}
};

// Reasonable Assumptions
// When a review is submitted, the requested changes are immediately made
// Reviews happen concurrently
// A PR is merged when required number reviewers have reviewed it
// Reviewers are mutually exclusive from developers
// Only one developer will work on a single task at a time
// For all random rolls, assume a normal distribution from the mean

// Random
const normalDist = (someAverage) => someAverage * (1 + Math.random());
const rollError = (errorRate) => Math.random() > errorRate;
const randTaskPoints = () => normalDist(SIM_CONFIG.TASK.AVG_POINTS);
const rollForDevError = () => rollError(SIM_CONFIG.DEVELOPER.ERROR_RATE);
const rollForRevError = () => rollError(SIM_CONFIG.REVIEWER.ERROR_RATE);

// Value Definitions
const taskLines = (taskPoints) => taskPoints * SIM_CONFIG.TASK.AVG_LINES_PER_POINT;
const requiredReviews = (taskLines) => Math.ceil(taskLines / SIM_CONFIG.TASK.REVIEWERS_PER_LINE);


// Events
const EVENTS = {
	START_SPRINT: 'startSprint',
	DEV_TASK_REQUEST: 'taskRequested',
	DEV_TASK_ASSIGNMENT: (devName) => `taskAssignedTo-${devName}`,
	DEV_REVIEW_REQUEST: 'reviewRequested',
	REV_REQUEST_ADDITIONAL_REVIEW: 'requestAdditionalReview',
	REV_FULLY_REVIEWED: 'fullyReviewed'
};

const EventEmitter = require('events');
const SCM = new EventEmitter(); // source control as an event emitter

// Entities
class TeamEntity {
	constructor(scm) {
		this.scm = scm;
	}

	emit(event, emission) {
		this.scm.emit(event, emission);
	}

	listen(event, reaction) {
		this.scm.on(event, reaction)
	}
}

class ProjectManager extends TeamEntity {
	constructor(scm, todo) {
		super(scm);
		this.todo = [] || todo;
		this.completed = [];

		//setup scm listeners
		this.listen(EVENTS.DEV_TASK_REQUEST, assignTask);
		this.listen(EVENTS.REV_FULLY_REVIEWED, markTaskComplete);
	}

	assignTask(name) {
		if (this.todo.length > 0) {
			this.emit(EVENTS.DEV_TASK_ASSIGNMENT(name), this.todo.shift());
		}
	}

	markTaskComplete(task) {
		this.completed.push(task);
	}
}

class ReviewerQueue extends TeamEntity {
	constructor(scm, reviewers) {
		super(scm)
		this.reviewerQueue = [];

		//setup scm listeners
		this.listen(EVENTS.DEV_REVIEW_REQUEST, this.dispatchTaskToReviewer);
		this.listen(EVENTS.REV_REQUEST_ADDITIONAL_REVIEW, this.dispatchTaskToReviewer);
	}

	dispatchTaskToReviewer(task) {
		const reviewer = this.reviewerQueue.shift();
		// Try to add next reviewer, otherwise dispatch to next reviewer
		if (!task.hasReviewer(reviewer.revName)) {
			reviewer.assign(Task);
			this.reviewerQueue.push(reviewer);
		} else {
			this.reviewerQueue.push(reviewer);
			this.dispatchTaskToReviewer(task);
		}
		
	}
}

class Reviewer extends TeamEntity {
	constructor(scm, name) {
		super(scm);
		this.assignedTasks = [];
		this.isReviewing = false;
		this.revName = name;

		// setup scm listeners
	}

	assign(task) {
		// if this reviewer has not reviewed this PR, assign them
		if (!task.hasReviewer(this.revName)) {
			this.assignedTasks.push(task);
			if (!this.isReviewing) {
				this.review();
			}
		}
	}

	review() {
		if (!this.isReviewing && this.assignedTasks.length > 0) {
			this.isReviewing = true;
			const task = this.assignedTasks.shift();
			// For each error, roll for a chance of correcting a mistake
			for (let i = 0; i < taskLines(task.points); i++) {
				if (task.hasError(i) && !rollForRevError()) {
					task.correctError(i);
				}
			}
			task.reviewPR(this.revName);
			this.handleReviewedTask(task);
			this.isReviewing = false;
			// Look for a next task
			if (this.assignedTasks.length > 0) {
				this.review();
			}
		}
	}

	handleReviewedTask(task) {
		if (task.isFullyReviewed()) {
			this.emit(EVENTS.REV_FULLY_REVIEWED, task);
		} else {
			this.emit(EVENTS.REV_REQUEST_ADDITIONAL_REVIEW, task);
		}
	}
}

class Developer extends TeamEntity {
	constructor(scm, name) {
		super(scm);
		this.devName = name;

		// setup scm listeners
		this.listen(EVENTS.DEV_TASK_ASSIGNMENT(this.devName), this.performTask);
		this.listen(EVENTS.START_SPRINT, this.requestTask);
	}

	requestTask() {
		this.emit(EVENTS.DEV_TASK_REQUEST, this.devName);
	}

	performTask(task) {
		task.start();
		// for each line, roll for a chance of writing a mistake
		for (let i = 0; i < taskLines(task.points); i++) {
			if (rollForDevError()) {
				task.addError(lineNumber);
			}
		}
		this.submitForReview(task);
		this.requestTask();
	}

	submitForReview(task) {
		task.createPR();
		this.emit(EVENTS.DEV_REVIEW_REQUEST, task);
	}
}

// Task
// Encapsulates logic for conducting a task as well as the associated PR
const TASK = {
	STATE: {
		TO_DO: 'todo',
		IN_PROGRESS: 'in progress',
		READY_FOR_REVIEW: 'ready for review',
		IN_REVIEW: 'in review',
		COMPLETE: 'complete'
	}
};

class Set {
	constructor() {
		this.values = {};
	}

	contains(value) {
		return this.values[value];
	}

	add(value) {
		this.values[value] = true;
	}

	remove(value) {
		delete this.values[value];
	}

	length() {
		return this.values.length;
	}
}

class Task {
	constructor(points) {
		this.state = TASK.STATE.TO_DO;
		this.points = points || randTaskPoints();
		this.errorLines = new Set();
		this.reviewedBy = new Set();
	}

	isFullyReviewed() {
		return this.state === TASK.STATE.COMPLETE || requiredReviews(taskLines(this.points)) <= this.reviewedBy.length();
	}

	addError(lineNumber) {
		this.errorLines.add(lineNumber);
	}

	hasError(lineNumber) {
		this.errorLines.contains(lineNumber);
	}

	correctError(lineNumber) {
		this.errorLines.remove(lineNumber);
	}

	addReviewer(name) {
		this.reviewedBy.add(name);
	}

	hasReviewer(name) {
		this.reviewedBy.contains(name);
	}

	nextState(allowedInitialState, nextState) {
		if (this.state != initialState) {
			throw new Error(`cannot transition task from ${this.state} to ${nextState}`);
		}

		this.state = nextState;
	}

	start() {
		this.nextState(TASK.STATE.TO_DO, TASK.STATE.IN_PROGRESS);
	}

	createPR() {
		this.nextState(TASK.STATE.IN_PROGRESS, TASK.STATE.READY_FOR_REVIEW);
	}

	reviewPR(reviewer) {
		this.addReviewer(reviewer);
		// increment numbers of reviews made in this function
		if (this.state != TASK.STATE.IN_REVIEW) {
			this.nextState(TASK.STATE.READY_FOR_REVIEW, TASK.STATE.IN_REVIEW);
		} else if (this.isFullyReviewed()) {
			this.complete();
		}
	}

	complete() {
		// steps required to make a transition
		if (this.isFullyReviewed()) {
			this.nextState(TASK.STATE.IN_REVIEW, TASK.STATE.COMPLETE);
		}
	}
}










