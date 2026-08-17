import { fileURLToPath } from "node:url";
import fastifyStatic from "@fastify/static";
import Fastify from "fastify";
import { Kysely, PostgresDialect, sql } from "kysely";
import pg from "pg";
import { Migrator } from "kysely/migration";
//#region server/api/health.ts
/**
* The client's single bootstrap probe (research Decision 12). It reports the
* database, not just the process: a server that is up but cannot reach
* PostgreSQL must not be reported as ready, or the first real request would be
* the thing that discovers it.
*/
function registerHealthRoute(app, options) {
	app.get("/api/health", async (_request, reply) => {
		try {
			await sql`select 1`.execute(options.db);
			return await reply.code(200).send({ status: "ok" });
		} catch {
			return reply.code(503).send({ status: "unavailable" });
		}
	});
}
//#endregion
//#region src/shared/lib/ids/index.ts
var UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function isEntityId(value) {
	return typeof value === "string" && UUID_PATTERN.test(value);
}
function entityId(value) {
	if (!isEntityId(value)) throw new RangeError(`Invalid entity UUID: ${value}`);
	return value;
}
function generateEntityId(generateUuid = () => globalThis.crypto.randomUUID()) {
	return entityId(generateUuid());
}
function isNonNegativeInteger(value) {
	return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
function isPositiveInteger(value) {
	return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}
function requireNonNegativeInteger(value, name) {
	if (!isNonNegativeInteger(value)) throw new RangeError(`${name} must be a non-negative safe integer: ${String(value)}`);
	return value;
}
function requirePositiveInteger(value, name) {
	if (!isPositiveInteger(value)) throw new RangeError(`${name} must be a positive safe integer: ${String(value)}`);
	return value;
}
function increment(value, name) {
	if (value === Number.MAX_SAFE_INTEGER) throw new RangeError(`${name} cannot exceed Number.MAX_SAFE_INTEGER`);
	return value + 1;
}
function revision(value) {
	return requireNonNegativeInteger(value, "Revision");
}
function isRevision(value) {
	return isNonNegativeInteger(value);
}
function nextRevision(value) {
	return revision(increment(value, "Revision"));
}
function eventSequence(value) {
	return requirePositiveInteger(value, "EventSequence");
}
function nextEventSequence(value) {
	return eventSequence(increment(value, "EventSequence"));
}
function creationSequence(value) {
	return requirePositiveInteger(value, "CreationSequence");
}
function nextCreationSequence(value) {
	return creationSequence(increment(value, "CreationSequence"));
}
function dayPosition(value) {
	return requireNonNegativeInteger(value, "DayPosition");
}
function isDayPosition(value) {
	return isNonNegativeInteger(value);
}
function isDurationMinutes(value) {
	return isPositiveInteger(value);
}
function nonNegativeDurationMinutes(value) {
	return requireNonNegativeInteger(value, "NonNegativeDurationMinutes");
}
function isNonNegativeDurationMinutes(value) {
	return isNonNegativeInteger(value);
}
var INITIAL_REVISION = revision(0);
//#endregion
//#region src/shared/lib/local-date/local-date.ts
var LOCAL_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
var DAYS_IN_MONTH = [
	31,
	28,
	31,
	30,
	31,
	30,
	31,
	31,
	30,
	31,
	30,
	31
];
function isLeapYear$1(year) {
	return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}
function daysInMonth(year, month) {
	if (month === 2 && isLeapYear$1(year)) return 29;
	return DAYS_IN_MONTH[month - 1] ?? 0;
}
function parseParts(value) {
	const match = LOCAL_DATE_PATTERN.exec(value);
	if (match === null) return;
	const year = Number(match[1]);
	const month = Number(match[2]);
	const day = Number(match[3]);
	if (year < 1 || month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return;
	return {
		year,
		month,
		day
	};
}
function formatParts({ year, month, day }) {
	return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
function toUtcDate(value) {
	const parts = parseParts(value);
	if (parts === void 0) throw new RangeError(`Invalid LocalDate: ${value}`);
	const result = /* @__PURE__ */ new Date(0);
	result.setUTCHours(0, 0, 0, 0);
	result.setUTCFullYear(parts.year, parts.month - 1, parts.day);
	return result;
}
function isLocalDate(value) {
	return typeof value === "string" && parseParts(value) !== void 0;
}
function parseLocalDate(value) {
	return isLocalDate(value) ? value : void 0;
}
function localDate(value) {
	const parsed = parseLocalDate(value);
	if (parsed === void 0) throw new RangeError(`Invalid LocalDate: ${value}`);
	return parsed;
}
function localDateFromParts(year, month, day) {
	if (![
		year,
		month,
		day
	].every(Number.isSafeInteger)) throw new RangeError("LocalDate parts must be safe integers");
	return localDate(formatParts({
		year,
		month,
		day
	}));
}
function getLocalDateParts(value) {
	const parts = parseParts(value);
	if (parts === void 0) throw new RangeError(`Invalid LocalDate: ${value}`);
	return parts;
}
function compareLocalDates(left, right) {
	if (left === right) return 0;
	return left < right ? -1 : 1;
}
function addDays(value, amount) {
	if (!Number.isSafeInteger(amount)) throw new RangeError(`Day delta must be a safe integer: ${String(amount)}`);
	const result = toUtcDate(value);
	result.setUTCDate(result.getUTCDate() + amount);
	const year = result.getUTCFullYear();
	if (!Number.isFinite(result.getTime()) || year < 1 || year > 9999) throw new RangeError(`LocalDate arithmetic is outside 0001-01-01 through 9999-12-31`);
	return localDateFromParts(year, result.getUTCMonth() + 1, result.getUTCDate());
}
function isoWeekday(value) {
	const sundayFirst = toUtcDate(value).getUTCDay();
	return sundayFirst === 0 ? 7 : sundayFirst;
}
function startOfWeek(value) {
	return addDays(value, 1 - isoWeekday(value));
}
function weekDates(value) {
	const monday = startOfWeek(value);
	return [
		monday,
		addDays(monday, 1),
		addDays(monday, 2),
		addDays(monday, 3),
		addDays(monday, 4),
		addDays(monday, 5),
		addDays(monday, 6)
	];
}
//#endregion
//#region src/shared/lib/result/index.ts
function ok(value) {
	return {
		ok: true,
		value
	};
}
function err(error) {
	return {
		ok: false,
		error
	};
}
function describeUnexpectedValue(value) {
	if (typeof value === "string") return value;
	try {
		return JSON.stringify(value);
	} catch {
		return String(value);
	}
}
function assertNever(value, context = "Unhandled value") {
	throw new Error(`${context}: ${describeUnexpectedValue(value)}`);
}
//#endregion
//#region src/entities/planning/model/day.ts
function isFivePointOrdinal(value) {
	return typeof value === "number" && Number.isSafeInteger(value) && value >= 1 && value <= 5;
}
/** Prepares one immutable Daily State replacement for an open Day/Week. */
function prepareDailyStateUpdate(input) {
	if (input.day.status === "closed") return err({
		code: "PeriodImmutable",
		date: input.day.date
	});
	if (input.weekStatus === "completed") return err({
		code: "PeriodImmutable",
		weekStart: input.day.weekStart
	});
	const issues = [];
	if (input.energy !== void 0 && !isFivePointOrdinal(input.energy)) issues.push({
		field: "energy",
		message: "Energy must be an integer from 1 to 5"
	});
	if (input.mood !== void 0 && !isFivePointOrdinal(input.mood)) issues.push({
		field: "mood",
		message: "Mood must be an integer from 1 to 5"
	});
	if (input.sleepDurationMinutes !== void 0 && !isNonNegativeInteger(input.sleepDurationMinutes)) issues.push({
		field: "sleepDurationMinutes",
		message: "Sleep duration must be a non-negative integer"
	});
	if (issues.length > 0) return err({
		code: "ValidationFailure",
		issues
	});
	const state = {
		...input.energy === void 0 ? {} : { energy: input.energy },
		...input.mood === void 0 ? {} : { mood: input.mood },
		...input.sleepDurationMinutes === void 0 ? {} : { sleepDurationMinutes: nonNegativeDurationMinutes(input.sleepDurationMinutes) },
		updatedAt: input.updatedAt
	};
	return ok({
		...input.day,
		state,
		revision: nextRevision(input.day.revision)
	});
}
function createOpenDay(date) {
	return {
		date,
		weekStart: startOfWeek(date),
		status: "open",
		revision: INITIAL_REVISION
	};
}
//#endregion
//#region server/api/parsers.ts
/**
* Fields the `PlanningRepository` interface has never exposed. A caller must
* not be able to stamp an audit instant on a specific record or choose when a
* recurrence rule takes effect: the boundary comment at
* `planning-repository.ts:291` calls both out as deliberately absent, and
* allowing them now would let a caller backdate individual history entries.
*
* This is distinct from the `X-Orbit-Instant` header, which carries one clock
* *reading* per request from which the server derives every timestamp.
*/
var FORBIDDEN_FIELDS = /* @__PURE__ */ new Set([
	"occurredAt",
	"enteredAt",
	"finalizedAt",
	"updatedAt",
	"createdAt",
	"completedAt",
	"closedAt",
	"actualCompletedAt",
	"effectiveFrom",
	"effectiveThrough",
	"effectiveDate",
	"ruleRevision",
	"createdSequence",
	"sequence",
	"revision"
]);
var Issues = class {
	list = [];
	add(field, message) {
		this.list.push({
			field,
			message
		});
	}
	get failed() {
		return this.list.length > 0;
	}
};
function isRecord(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
function rejectForbiddenFields(body, issues, path = "") {
	for (const [key, value] of Object.entries(body)) {
		if (FORBIDDEN_FIELDS.has(key)) {
			issues.add(`${path}${key}`, "This field is not part of the planning boundary");
			continue;
		}
		if (isRecord(value)) rejectForbiddenFields(value, issues, `${path}${key}.`);
	}
}
function requireBody(input, issues) {
	if (!isRecord(input)) {
		issues.add("body", "Request body must be a JSON object");
		return {};
	}
	rejectForbiddenFields(input, issues);
	return input;
}
function result(issues, build) {
	return issues.failed ? {
		ok: false,
		issues: issues.list
	} : {
		ok: true,
		value: build()
	};
}
function readString(body, field, issues) {
	const value = body[field];
	if (typeof value !== "string") {
		issues.add(field, `${field} must be a string`);
		return "";
	}
	return value;
}
function readOptionalString(body, field, issues) {
	const value = body[field];
	if (value === void 0) return void 0;
	if (typeof value !== "string") {
		issues.add(field, `${field} must be a string`);
		return;
	}
	return value;
}
/** `undefined` leaves the field unchanged; `null` explicitly clears it. */
function readClearableString(body, field, issues) {
	if (!Object.hasOwn(body, field)) return void 0;
	const value = body[field];
	if (value === null) return null;
	if (value === void 0) return void 0;
	if (typeof value !== "string") {
		issues.add(field, `${field} must be a string, null to clear it, or omitted`);
		return;
	}
	return value;
}
function readLocalDate(body, field, issues) {
	const parsed = parseLocalDate(body[field]);
	if (parsed === void 0) {
		issues.add(field, `${field} must be a YYYY-MM-DD calendar date`);
		return "";
	}
	return parsed;
}
function readOptionalLocalDate(body, field, issues) {
	if (body[field] === void 0) return void 0;
	return readLocalDate(body, field, issues);
}
function readEntityId(body, field, issues) {
	const value = body[field];
	if (!isEntityId(value)) {
		issues.add(field, `${field} must be a UUID`);
		return "";
	}
	return value;
}
function readRevision(body, field, issues) {
	const value = body[field];
	if (!isRevision(value)) {
		issues.add(field, `${field} must be a non-negative integer revision`);
		return 0;
	}
	return value;
}
function readDuration(body, field, issues) {
	const value = body[field];
	if (!isDurationMinutes(value)) {
		issues.add(field, `${field} must be a positive whole number of minutes`);
		return 1;
	}
	return value;
}
function readOptionalDuration(body, field, issues) {
	if (body[field] === void 0) return void 0;
	return readDuration(body, field, issues);
}
function readDayPosition(body, field, issues) {
	const value = body[field];
	if (!isDayPosition(value)) {
		issues.add(field, `${field} must be a non-negative integer position`);
		return 0;
	}
	return value;
}
function readOptionalDayPosition(body, field, issues) {
	if (body[field] === void 0) return void 0;
	return readDayPosition(body, field, issues);
}
function readIdList(body, field, issues) {
	const value = body[field];
	if (!Array.isArray(value)) {
		issues.add(field, `${field} must be an array of UUIDs`);
		return [];
	}
	const ids = [];
	for (const [index, candidate] of value.entries()) {
		if (!isEntityId(candidate)) {
			issues.add(`${field}[${String(index)}]`, `${field} entries must be UUIDs`);
			continue;
		}
		ids.push(candidate);
	}
	return ids;
}
function readPlacement(body, issues) {
	const placement = body.placement;
	if (!isRecord(placement)) {
		issues.add("placement", "placement must be an object");
		return { kind: "backlog" };
	}
	if (placement.kind === "backlog") return { kind: "backlog" };
	if (placement.kind === "day") return {
		kind: "day",
		date: readLocalDate(placement, "date", issues)
	};
	issues.add("placement.kind", "placement.kind must be \"day\" or \"backlog\"");
	return { kind: "backlog" };
}
function readRecurrenceRule(body, issues) {
	const rule = body.recurrenceRule;
	if (!isRecord(rule)) {
		issues.add("recurrenceRule", "recurrenceRule must be an object");
		return {
			startDate: "",
			weekdays: []
		};
	}
	const weekdaysValue = rule.weekdays;
	const weekdays = [];
	if (!Array.isArray(weekdaysValue)) issues.add("recurrenceRule.weekdays", "weekdays must be an array of ISO weekday numbers");
	else for (const [index, candidate] of weekdaysValue.entries()) {
		if (typeof candidate !== "number" || !Number.isInteger(candidate) || candidate < 1 || candidate > 7) {
			issues.add(`recurrenceRule.weekdays[${String(index)}]`, "weekdays entries must be integers from 1 to 7");
			continue;
		}
		weekdays.push(candidate);
	}
	const startDate = readLocalDate(rule, "startDate", issues);
	const endDate = readOptionalLocalDate(rule, "endDate", issues);
	return {
		startDate,
		weekdays,
		...endDate === void 0 ? {} : { endDate }
	};
}
function readTaskTemplate(body, issues) {
	const template = body.template;
	if (!isRecord(template)) {
		issues.add("template", "template must be an object");
		return {
			title: "",
			plannedDurationMinutes: 1
		};
	}
	const notes = readOptionalString(template, "notes", issues);
	const startTime = readOptionalString(template, "startTime", issues);
	const endTime = readOptionalString(template, "endTime", issues);
	return {
		title: readString(template, "title", issues),
		...notes === void 0 ? {} : { notes },
		plannedDurationMinutes: readDuration(template, "plannedDurationMinutes", issues),
		...startTime === void 0 ? {} : { startTime },
		...endTime === void 0 ? {} : { endTime }
	};
}
function readFivePoint(body, field, issues) {
	const value = body[field];
	if (value === void 0) return void 0;
	if (!isFivePointOrdinal(value)) {
		issues.add(field, `${field} must be an integer from 1 to 5`);
		return;
	}
	return value;
}
function readDispositions(body, issues) {
	const dispositions = body.dispositions;
	if (!isRecord(dispositions)) {
		issues.add("dispositions", "dispositions must be an object keyed by task occurrence id");
		return {};
	}
	const parsed = {};
	for (const [occurrenceId, value] of Object.entries(dispositions)) {
		const field = `dispositions.${occurrenceId}`;
		if (!isEntityId(occurrenceId)) {
			issues.add(field, "disposition keys must be task occurrence UUIDs");
			continue;
		}
		if (!isRecord(value)) {
			issues.add(field, "each disposition must be an object");
			continue;
		}
		switch (value.kind) {
			case "keep-unfinished":
				parsed[occurrenceId] = { kind: "keep-unfinished" };
				break;
			case "move-to-backlog":
				parsed[occurrenceId] = { kind: "move-to-backlog" };
				break;
			case "cancel":
				parsed[occurrenceId] = { kind: "cancel" };
				break;
			case "move-to-date":
				parsed[occurrenceId] = {
					kind: "move-to-date",
					destinationDate: readLocalDate(value, "destinationDate", issues),
					durationMinutes: readDuration(value, "durationMinutes", issues),
					dayPosition: readDayPosition(value, "dayPosition", issues)
				};
				break;
			default: issues.add(`${field}.kind`, "disposition kind must be keep-unfinished, move-to-date, move-to-backlog, or cancel");
		}
	}
	return parsed;
}
function parseLocalDateArgument(input, field) {
	const issues = new Issues();
	const value = readLocalDate(requireBody(input, issues), field, issues);
	return result(issues, () => value);
}
function parseOccurrenceIdArgument(input, field) {
	const issues = new Issues();
	const value = readEntityId(requireBody(input, issues), field, issues);
	return result(issues, () => value);
}
function parseEmpty(input) {
	const issues = new Issues();
	requireBody(input, issues);
	return result(issues, () => ({}));
}
function parseHistoryQuery(input) {
	const issues = new Issues();
	const body = requireBody(input, issues);
	const anchorDate = readLocalDate(body, "anchorDate", issues);
	switch (body.mode) {
		case "day": return result(issues, () => ({
			mode: "day",
			anchorDate
		}));
		case "week": return result(issues, () => ({
			mode: "week",
			anchorDate
		}));
		case "month": {
			const selectedDate = readLocalDate(body, "selectedDate", issues);
			return result(issues, () => ({
				mode: "month",
				anchorDate,
				selectedDate
			}));
		}
		default:
			issues.add("mode", "mode must be \"day\", \"week\", or \"month\"");
			return {
				ok: false,
				issues: issues.list
			};
	}
}
function parseOpenPeriodRange(input) {
	const issues = new Issues();
	const body = requireBody(input, issues);
	switch (body.kind) {
		case "day": {
			const date = readLocalDate(body, "date", issues);
			return result(issues, () => ({
				kind: "day",
				date
			}));
		}
		case "week": {
			const weekStart = readLocalDate(body, "weekStart", issues);
			return result(issues, () => ({
				kind: "week",
				weekStart
			}));
		}
		case "month": {
			const anchorDate = readLocalDate(body, "anchorDate", issues);
			return result(issues, () => ({
				kind: "month",
				anchorDate
			}));
		}
		default:
			issues.add("kind", "kind must be \"day\", \"week\", or \"month\"");
			return {
				ok: false,
				issues: issues.list
			};
	}
}
function parseEnsureCalendarWeek(input) {
	const issues = new Issues();
	const date = readLocalDate(requireBody(input, issues), "date", issues);
	return result(issues, () => ({ date }));
}
function parseAddWeeklyGoal(input) {
	const issues = new Issues();
	const body = requireBody(input, issues);
	const weekStart = readLocalDate(body, "weekStart", issues);
	const statement = readString(body, "statement", issues);
	const expectedRevision = readRevision(body, "expectedRevision", issues);
	return result(issues, () => ({
		weekStart,
		statement,
		expectedRevision
	}));
}
function parseEditWeeklyGoal(input) {
	const issues = new Issues();
	const body = requireBody(input, issues);
	const weekStart = readLocalDate(body, "weekStart", issues);
	const goalId = readEntityId(body, "goalId", issues);
	const statement = readString(body, "statement", issues);
	const expectedRevision = readRevision(body, "expectedRevision", issues);
	return result(issues, () => ({
		weekStart,
		goalId,
		statement,
		expectedRevision
	}));
}
function parseReorderWeeklyGoals(input) {
	const issues = new Issues();
	const body = requireBody(input, issues);
	const weekStart = readLocalDate(body, "weekStart", issues);
	const orderedGoalIds = readIdList(body, "orderedGoalIds", issues);
	const expectedRevision = readRevision(body, "expectedRevision", issues);
	return result(issues, () => ({
		weekStart,
		orderedGoalIds,
		expectedRevision
	}));
}
function parseDeleteWeeklyGoal(input) {
	const issues = new Issues();
	const body = requireBody(input, issues);
	const weekStart = readLocalDate(body, "weekStart", issues);
	const goalId = readEntityId(body, "goalId", issues);
	const expectedRevision = readRevision(body, "expectedRevision", issues);
	return result(issues, () => ({
		weekStart,
		goalId,
		expectedRevision
	}));
}
function parseCreateTask(input) {
	const issues = new Issues();
	const body = requireBody(input, issues);
	const title = readString(body, "title", issues);
	const notes = readOptionalString(body, "notes", issues);
	const startTime = readOptionalString(body, "startTime", issues);
	const endTime = readOptionalString(body, "endTime", issues);
	const placement = readPlacement(body, issues);
	const durationMinutes = readOptionalDuration(body, "durationMinutes", issues);
	const dayPosition = readOptionalDayPosition(body, "dayPosition", issues);
	return result(issues, () => ({
		title,
		...notes === void 0 ? {} : { notes },
		...startTime === void 0 ? {} : { startTime },
		...endTime === void 0 ? {} : { endTime },
		placement,
		...durationMinutes === void 0 ? {} : { durationMinutes },
		...dayPosition === void 0 ? {} : { dayPosition }
	}));
}
function parseEditTaskOccurrence(input) {
	const issues = new Issues();
	const body = requireBody(input, issues);
	const occurrenceId = readEntityId(body, "occurrenceId", issues);
	const title = readOptionalString(body, "title", issues);
	const notes = readOptionalString(body, "notes", issues);
	const hasStartTime = Object.hasOwn(body, "startTime");
	const hasEndTime = Object.hasOwn(body, "endTime");
	const startTime = readClearableString(body, "startTime", issues);
	const endTime = readClearableString(body, "endTime", issues);
	const durationMinutes = readOptionalDuration(body, "durationMinutes", issues);
	const expectedRevision = readRevision(body, "expectedRevision", issues);
	return result(issues, () => ({
		occurrenceId,
		...title === void 0 ? {} : { title },
		...notes === void 0 ? {} : { notes },
		...hasStartTime ? { startTime: startTime ?? null } : {},
		...hasEndTime ? { endTime: endTime ?? null } : {},
		...durationMinutes === void 0 ? {} : { durationMinutes },
		expectedRevision
	}));
}
function parseSetTaskCompletion(input) {
	const issues = new Issues();
	const body = requireBody(input, issues);
	const occurrenceId = readEntityId(body, "occurrenceId", issues);
	const date = readLocalDate(body, "date", issues);
	if (typeof body.completed !== "boolean") issues.add("completed", "completed must be a boolean");
	const completed = body.completed === true;
	const expectedRevision = readRevision(body, "expectedRevision", issues);
	return result(issues, () => ({
		occurrenceId,
		date,
		completed,
		expectedRevision
	}));
}
function parseMoveTaskToDate(input) {
	const issues = new Issues();
	const body = requireBody(input, issues);
	const occurrenceId = readEntityId(body, "occurrenceId", issues);
	const destinationDate = readLocalDate(body, "destinationDate", issues);
	const durationMinutes = readDuration(body, "durationMinutes", issues);
	const dayPosition = readDayPosition(body, "dayPosition", issues);
	const expectedRevision = readRevision(body, "expectedRevision", issues);
	return result(issues, () => ({
		occurrenceId,
		destinationDate,
		durationMinutes,
		dayPosition,
		expectedRevision
	}));
}
function parseMoveTaskToBacklog(input) {
	const issues = new Issues();
	const body = requireBody(input, issues);
	const occurrenceId = readEntityId(body, "occurrenceId", issues);
	const expectedRevision = readRevision(body, "expectedRevision", issues);
	return result(issues, () => ({
		occurrenceId,
		expectedRevision
	}));
}
function parseDeleteTaskOccurrence(input) {
	const issues = new Issues();
	const body = requireBody(input, issues);
	const occurrenceId = readEntityId(body, "occurrenceId", issues);
	const expectedRevision = readRevision(body, "expectedRevision", issues);
	return result(issues, () => ({
		occurrenceId,
		expectedRevision
	}));
}
function parseReorderDatedTasks(input) {
	const issues = new Issues();
	const body = requireBody(input, issues);
	const date = readLocalDate(body, "date", issues);
	const orderedOccurrenceIds = readIdList(body, "orderedOccurrenceIds", issues);
	const expectedDayRevision = readRevision(body, "expectedDayRevision", issues);
	return result(issues, () => ({
		date,
		orderedOccurrenceIds,
		expectedDayRevision
	}));
}
function parseCreateTaskSeries(input) {
	const issues = new Issues();
	const body = requireBody(input, issues);
	const template = readTaskTemplate(body, issues);
	const recurrenceRule = readRecurrenceRule(body, issues);
	return result(issues, () => ({
		template,
		recurrenceRule
	}));
}
function parseUpdateTaskSeriesRule(input) {
	const issues = new Issues();
	const body = requireBody(input, issues);
	const seriesId = readEntityId(body, "seriesId", issues);
	const recurrenceRule = readRecurrenceRule(body, issues);
	const expectedRevision = readRevision(body, "expectedRevision", issues);
	return result(issues, () => ({
		seriesId,
		recurrenceRule,
		expectedRevision
	}));
}
function parseStopTaskSeries(input) {
	const issues = new Issues();
	const body = requireBody(input, issues);
	const seriesId = readEntityId(body, "seriesId", issues);
	const expectedRevision = readRevision(body, "expectedRevision", issues);
	return result(issues, () => ({
		seriesId,
		expectedRevision
	}));
}
function parseCreateHabitDefinition(input) {
	const issues = new Issues();
	const body = requireBody(input, issues);
	const title = readString(body, "title", issues);
	const recurrenceRule = readRecurrenceRule(body, issues);
	return result(issues, () => ({
		title,
		recurrenceRule
	}));
}
function parseUpdateHabitRule(input) {
	const issues = new Issues();
	const body = requireBody(input, issues);
	const definitionId = readEntityId(body, "definitionId", issues);
	const recurrenceRule = readRecurrenceRule(body, issues);
	const expectedRevision = readRevision(body, "expectedRevision", issues);
	return result(issues, () => ({
		definitionId,
		recurrenceRule,
		expectedRevision
	}));
}
function parseStopHabitDefinition(input) {
	const issues = new Issues();
	const body = requireBody(input, issues);
	const definitionId = readEntityId(body, "definitionId", issues);
	const expectedRevision = readRevision(body, "expectedRevision", issues);
	return result(issues, () => ({
		definitionId,
		expectedRevision
	}));
}
function parseEditHabitOccurrence(input) {
	const issues = new Issues();
	const body = requireBody(input, issues);
	const occurrenceId = readEntityId(body, "occurrenceId", issues);
	const title = readString(body, "title", issues);
	const expectedRevision = readRevision(body, "expectedRevision", issues);
	return result(issues, () => ({
		occurrenceId,
		title,
		expectedRevision
	}));
}
function parseRecordHabitOutcome(input) {
	const issues = new Issues();
	const body = requireBody(input, issues);
	const occurrenceId = readEntityId(body, "occurrenceId", issues);
	if (body.outcome !== "completed" && body.outcome !== "not-completed") issues.add("outcome", "outcome must be \"completed\" or \"not-completed\"");
	const outcome = body.outcome === "completed" ? "completed" : "not-completed";
	const expectedRevision = readRevision(body, "expectedRevision", issues);
	return result(issues, () => ({
		occurrenceId,
		outcome,
		expectedRevision
	}));
}
function parseHabitOccurrenceCommand(input) {
	const issues = new Issues();
	const body = requireBody(input, issues);
	const occurrenceId = readEntityId(body, "occurrenceId", issues);
	const expectedRevision = readRevision(body, "expectedRevision", issues);
	return result(issues, () => ({
		occurrenceId,
		expectedRevision
	}));
}
var parseCorrectBoundaryMiss = parseHabitOccurrenceCommand;
var parseClearHabitOutcome = parseHabitOccurrenceCommand;
var parseDeleteHabitOccurrence = parseHabitOccurrenceCommand;
function parseSaveDailyState(input) {
	const issues = new Issues();
	const body = requireBody(input, issues);
	const date = readLocalDate(body, "date", issues);
	const energy = readFivePoint(body, "energy", issues);
	const mood = readFivePoint(body, "mood", issues);
	let sleepDurationMinutes;
	if (body.sleepDurationMinutes !== void 0) if (!isNonNegativeDurationMinutes(body.sleepDurationMinutes)) issues.add("sleepDurationMinutes", "sleepDurationMinutes must be a non-negative integer");
	else sleepDurationMinutes = body.sleepDurationMinutes;
	const expectedDayRevision = readRevision(body, "expectedDayRevision", issues);
	return result(issues, () => ({
		date,
		...energy === void 0 ? {} : { energy },
		...mood === void 0 ? {} : { mood },
		...sleepDurationMinutes === void 0 ? {} : { sleepDurationMinutes },
		expectedDayRevision
	}));
}
function parseCloseDay(input) {
	const issues = new Issues();
	const body = requireBody(input, issues);
	const date = readLocalDate(body, "date", issues);
	const expectedDayRevision = readRevision(body, "expectedDayRevision", issues);
	const dispositions = readDispositions(body, issues);
	return result(issues, () => ({
		date,
		expectedDayRevision,
		dispositions
	}));
}
function parseCompleteWeek(input) {
	const issues = new Issues();
	const body = requireBody(input, issues);
	const weekStart = readLocalDate(body, "weekStart", issues);
	const reflection = readOptionalString(body, "reflection", issues);
	const expectedWeekRevision = readRevision(body, "expectedWeekRevision", issues);
	return result(issues, () => ({
		weekStart,
		...reflection === void 0 ? {} : { reflection },
		expectedWeekRevision
	}));
}
//#endregion
//#region src/shared/lib/local-date/clock.ts
var INSTANT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
function isInstant(value) {
	if (typeof value !== "string" || !INSTANT_PATTERN.test(value)) return false;
	const parsed = new Date(value);
	return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value;
}
function parseInstant(value) {
	return isInstant(value) ? value : void 0;
}
function instant(value) {
	const parsed = parseInstant(value);
	if (parsed === void 0) throw new RangeError(`Invalid canonical UTC instant: ${value}`);
	return parsed;
}
function createFixedClock(value) {
	return Object.freeze({
		now: () => value.instant,
		currentLocalDate: () => value.currentLocalDate
	});
}
//#endregion
//#region server/api/request-clock.ts
var LOCAL_DATE_HEADER = "x-orbit-local-date";
var INSTANT_HEADER = "x-orbit-instant";
function headerValue(headers, name) {
	const value = headers[name];
	if (typeof value === "string") return value;
	if (Array.isArray(value)) return value[0];
}
/**
* Rebuilds feature 001's clock from the caller's complete reading.
*
* The server has no clock of its own: it never calls `createSystemClock`,
* `Date.now()`, `new Date()`, or reads its timezone. A missing or malformed
* header is a `400` — there is no fallback to server time, because that
* fallback is exactly what FR-009 prohibits. Both halves travel together
* because a clock whose halves can disagree is a time model feature 001 does
* not have.
*/
function readRequestClock(headers) {
	const rawDate = headerValue(headers, LOCAL_DATE_HEADER);
	const rawInstant = headerValue(headers, INSTANT_HEADER);
	if (rawDate === void 0 || rawInstant === void 0) return {
		ok: false,
		message: `Missing required clock header(s): ${[...rawDate === void 0 ? ["X-Orbit-Local-Date"] : [], ...rawInstant === void 0 ? ["X-Orbit-Instant"] : []].join(", ")}.`
	};
	const currentLocalDate = parseLocalDate(rawDate);
	if (currentLocalDate === void 0) return {
		ok: false,
		message: `X-Orbit-Local-Date must be YYYY-MM-DD; received "${rawDate}".`
	};
	const instantValue = parseInstant(rawInstant);
	if (instantValue === void 0) return {
		ok: false,
		message: `X-Orbit-Instant must be a canonical UTC instant (YYYY-MM-DDTHH:MM:SS.sssZ); received "${rawInstant}".`
	};
	return {
		ok: true,
		clock: createFixedClock({
			instant: instantValue,
			currentLocalDate
		})
	};
}
//#endregion
//#region server/api/routes.ts
function handler(parseInput, invoke) {
	return {
		parse: parseInput,
		invoke
	};
}
/**
* One route per `PlanningRepository` method (research Decision 3). The
* interface *is* the contract, so the API mirrors it one-to-one rather than
* modelling resources independently — there is nothing here to drift from.
*/
var PLANNING_METHODS = Object.freeze({
	getWeekView: handler((input) => parseLocalDateArgument(input, "dateOrWeekStart"), (repository, value) => repository.getWeekView(value)),
	getDayView: handler((input) => parseLocalDateArgument(input, "date"), (repository, value) => repository.getDayView(value)),
	getBacklogView: handler(parseEmpty, (repository) => repository.getBacklogView()),
	getHistoryView: handler(parseHistoryQuery, (repository, value) => repository.getHistoryView(value)),
	getTaskHistory: handler((input) => parseOccurrenceIdArgument(input, "occurrenceId"), (repository, value) => repository.getTaskHistory(value)),
	prepareOpenPeriod: handler(parseOpenPeriodRange, (repository, value) => repository.prepareOpenPeriod(value)),
	ensureCalendarWeek: handler(parseEnsureCalendarWeek, (repository, value) => repository.ensureCalendarWeek(value)),
	addWeeklyGoal: handler(parseAddWeeklyGoal, (repository, value) => repository.addWeeklyGoal(value)),
	editWeeklyGoal: handler(parseEditWeeklyGoal, (repository, value) => repository.editWeeklyGoal(value)),
	reorderWeeklyGoals: handler(parseReorderWeeklyGoals, (repository, value) => repository.reorderWeeklyGoals(value)),
	deleteWeeklyGoal: handler(parseDeleteWeeklyGoal, (repository, value) => repository.deleteWeeklyGoal(value)),
	createTask: handler(parseCreateTask, (repository, value) => repository.createTask(value)),
	editTaskOccurrence: handler(parseEditTaskOccurrence, (repository, value) => repository.editTaskOccurrence(value)),
	setTaskCompletion: handler(parseSetTaskCompletion, (repository, value) => repository.setTaskCompletion(value)),
	moveTaskToDate: handler(parseMoveTaskToDate, (repository, value) => repository.moveTaskToDate(value)),
	moveTaskToBacklog: handler(parseMoveTaskToBacklog, (repository, value) => repository.moveTaskToBacklog(value)),
	deleteTaskOccurrence: handler(parseDeleteTaskOccurrence, (repository, value) => repository.deleteTaskOccurrence(value)),
	reorderDatedTasks: handler(parseReorderDatedTasks, (repository, value) => repository.reorderDatedTasks(value)),
	createTaskSeries: handler(parseCreateTaskSeries, (repository, value) => repository.createTaskSeries(value)),
	updateTaskSeriesRule: handler(parseUpdateTaskSeriesRule, (repository, value) => repository.updateTaskSeriesRule(value)),
	stopTaskSeries: handler(parseStopTaskSeries, (repository, value) => repository.stopTaskSeries(value)),
	createHabitDefinition: handler(parseCreateHabitDefinition, (repository, value) => repository.createHabitDefinition(value)),
	updateHabitRule: handler(parseUpdateHabitRule, (repository, value) => repository.updateHabitRule(value)),
	stopHabitDefinition: handler(parseStopHabitDefinition, (repository, value) => repository.stopHabitDefinition(value)),
	editHabitOccurrence: handler(parseEditHabitOccurrence, (repository, value) => repository.editHabitOccurrence(value)),
	recordHabitOutcome: handler(parseRecordHabitOutcome, (repository, value) => repository.recordHabitOutcome(value)),
	correctBoundaryMissToCompleted: handler(parseCorrectBoundaryMiss, (repository, value) => repository.correctBoundaryMissToCompleted(value)),
	clearHabitOutcome: handler(parseClearHabitOutcome, (repository, value) => repository.clearHabitOutcome(value)),
	deleteHabitOccurrence: handler(parseDeleteHabitOccurrence, (repository, value) => repository.deleteHabitOccurrence(value)),
	saveDailyState: handler(parseSaveDailyState, (repository, value) => repository.saveDailyState(value)),
	closeDay: handler(parseCloseDay, (repository, value) => repository.closeDay(value)),
	completeWeek: handler(parseCompleteWeek, (repository, value) => repository.completeWeek(value))
});
Object.keys(PLANNING_METHODS);
function validationFailure(issues) {
	return {
		ok: false,
		error: {
			code: "ValidationFailure",
			issues
		}
	};
}
function registerPlanningRoutes(app, options) {
	app.post("/api/planning/:method", async (request, reply) => {
		const handlerForMethod = Object.hasOwn(PLANNING_METHODS, request.params.method) ? PLANNING_METHODS[request.params.method] : void 0;
		if (handlerForMethod === void 0) return reply.code(404).send({ error: `Unknown planning method: ${request.params.method}` });
		const clock = readRequestClock(request.headers);
		if (!clock.ok) return reply.code(400).send({ error: clock.message });
		const parsed = handlerForMethod.parse(request.body ?? {});
		if (!parsed.ok) return reply.code(200).send(validationFailure(parsed.issues));
		const repository = options.createRepository(clock.clock);
		const envelope = await handlerForMethod.invoke(repository, parsed.value);
		return reply.code(200).send(envelope);
	});
}
//#endregion
//#region server/app.ts
function defaultClientRoot() {
	return fileURLToPath(new URL("../dist", import.meta.url));
}
/**
* Builds the Fastify app from its dependencies rather than reaching for module
* state, so tests can drive the real routes through `app.inject()` without
* listening on a port.
*/
async function createApp(options) {
	const app = Fastify({ logger: options.logger ?? false });
	app.setErrorHandler((error, request, reply) => {
		request.log.error(error);
		const statusCode = error.statusCode;
		const status = typeof statusCode === "number" && statusCode >= 400 ? statusCode : 500;
		const message = error instanceof Error ? error.message : "Unexpected server failure";
		return reply.code(status).send({ error: message });
	});
	registerHealthRoute(app, { db: options.db });
	registerPlanningRoutes(app, { createRepository: options.createRepository });
	if (options.serveStaticClient === true) {
		const root = options.clientRoot ?? defaultClientRoot();
		await app.register(fastifyStatic, {
			root,
			wildcard: false
		});
		app.setNotFoundHandler((request, reply) => {
			if (request.url.startsWith("/api")) return reply.code(404).send({ error: `Unknown endpoint: ${request.url}` });
			return reply.sendFile("index.html");
		});
	}
	return app;
}
//#endregion
//#region server/config.ts
var DEFAULT_PORT = 3e3;
function parseEnvironment(value) {
	if (value === "production" || value === "test" || value === "development") return value;
	if (value === void 0 || value.length === 0) return "development";
	throw new Error(`NODE_ENV must be one of development, production, or test; received "${value}".`);
}
function parsePort(value) {
	if (value === void 0 || value.length === 0) return DEFAULT_PORT;
	const port = Number(value);
	if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw new Error(`PORT must be an integer between 1 and 65535; received "${value}".`);
	return port;
}
/**
* Fails fast at startup rather than at the first query, so a misconfigured
* deployment never reaches the point of reporting a database problem as a
* transient server failure.
*/
function readServerConfig(options = {}) {
	const env = options.env ?? process.env;
	const databaseUrl = env.DATABASE_URL;
	if (databaseUrl === void 0 || databaseUrl.trim().length === 0) throw new Error("DATABASE_URL is required. Set it to a PostgreSQL connection string, for example postgres://orbit:orbit@localhost:5432/orbit (see .env.example).");
	return {
		databaseUrl: databaseUrl.trim(),
		port: parsePort(env.PORT),
		nodeEnv: parseEnvironment(env.NODE_ENV)
	};
}
//#endregion
//#region server/db/client.ts
/** PostgreSQL type OIDs whose default `pg` parsing would destroy a brand. */
var OID_INT8 = 20;
var OID_DATE = 1082;
var OID_TIMESTAMP = 1114;
var OID_TIMESTAMPTZ = 1184;
var POSTGRES_TIMESTAMP_PATTERN = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(?:\.(\d+))?(?:(Z)|([+-])(\d{2})(?::?(\d{2}))?)?$/;
/**
* Feature 001's `LocalDate` is a branded `YYYY-MM-DD` string. Passing a `date`
* column through a JS `Date` would reinterpret it in the process timezone and
* shift it by a day, which is exactly the dependency FR-009 forbids.
*/
function parsePostgresDate(value) {
	return localDate(value);
}
/**
* Converts PostgreSQL's `timestamptz` text form to feature 001's canonical
* `Instant` (`YYYY-MM-DDTHH:MM:SS.sssZ`) without constructing a `Date`.
*
* PostgreSQL trims trailing zeros from the fractional second, so an instant
* written as `.000` comes back with no fraction at all and has to be padded
* back to exactly three digits for the brand to validate.
*/
function parsePostgresTimestamp(value) {
	const match = POSTGRES_TIMESTAMP_PATTERN.exec(value.trim());
	if (match === null) throw new RangeError(`Unrecognized PostgreSQL timestamp: ${value}`);
	const [, date, time, fraction, zulu, sign, offsetHours, offsetMinutes] = match;
	if (date === void 0 || time === void 0) throw new RangeError(`Unrecognized PostgreSQL timestamp: ${value}`);
	if (!(zulu !== void 0 || sign === void 0 || Number(offsetHours ?? "0") === 0 && Number(offsetMinutes ?? "0") === 0)) throw new RangeError(`PostgreSQL returned a non-UTC timestamp (${value}); the connection must use TimeZone=UTC.`);
	return instant(`${date}T${time}.${(fraction ?? "").padEnd(3, "0").slice(0, 3)}Z`);
}
/**
* `CreationSequence` and `EventSequence` are branded JS numbers, but `pg`
* returns `bigint` as a string to avoid precision loss. Both stay far below
* `Number.MAX_SAFE_INTEGER` in this single-user application, and the conversion
* refuses anything that would not round-trip.
*/
function parsePostgresBigInt(value) {
	const parsed = Number(value);
	if (!Number.isSafeInteger(parsed)) throw new RangeError(`bigint ${value} is outside the safe integer range`);
	return parsed;
}
function createTypeParsers() {
	const builtins = (oid, format) => pg.types.getTypeParser(oid, format);
	return { getTypeParser: ((oid, format) => {
		switch (oid) {
			case OID_DATE: return parsePostgresDate;
			case OID_TIMESTAMP:
			case OID_TIMESTAMPTZ: return parsePostgresTimestamp;
			case OID_INT8: return parsePostgresBigInt;
			default: return builtins(oid, format);
		}
	}) };
}
function createPlanningDatabase(options) {
	const pool = new pg.Pool({
		connectionString: options.connectionString,
		...options.maxConnections === void 0 ? {} : { max: options.maxConnections },
		types: createTypeParsers(),
		options: "-c TimeZone=UTC"
	});
	const { onQuery } = options;
	const db = new Kysely({
		dialect: new PostgresDialect({ pool }),
		...onQuery === void 0 ? {} : { log: (event) => {
			onQuery(event.query.sql, event.query.parameters);
		} }
	});
	return {
		db,
		pool,
		async destroy() {
			await db.destroy();
		}
	};
}
//#endregion
//#region server/db/migrations/index.ts
/**
* A static map rather than Kysely's `FileMigrationProvider` (research
* Decision 10): the server ships as a bundle, so reading migration files from
* disk at runtime would work in development and fail in the container.
*/
var MIGRATIONS = Object.freeze({ "001-initial-schema": {
	async up(db) {
		await sql`
      CREATE TABLE weeks (
        start_date          date PRIMARY KEY,
        status              text NOT NULL,
        goals               jsonb NOT NULL DEFAULT '[]'::jsonb,
        reflection          text,
        completion_snapshot jsonb,
        completed_at        timestamptz,
        revision            integer NOT NULL,
        CONSTRAINT weeks_status_check CHECK (status IN ('open', 'completed')),
        CONSTRAINT weeks_revision_check CHECK (revision >= 0),
        CONSTRAINT weeks_completion_check CHECK (
          (status = 'completed') =
          (completion_snapshot IS NOT NULL AND completed_at IS NOT NULL)
        )
      )
    `.execute(db);
		await sql`
      CREATE TABLE days (
        date             date PRIMARY KEY,
        week_start       date NOT NULL REFERENCES weeks (start_date),
        status           text NOT NULL,
        state            jsonb,
        closure_snapshot jsonb,
        closed_at        timestamptz,
        revision         integer NOT NULL,
        CONSTRAINT days_status_check CHECK (status IN ('open', 'closed')),
        CONSTRAINT days_revision_check CHECK (revision >= 0),
        CONSTRAINT days_closure_check CHECK (
          (status = 'closed') = (closure_snapshot IS NOT NULL AND closed_at IS NOT NULL)
        )
      )
    `.execute(db);
		await sql`CREATE INDEX days_week_start_idx ON days (week_start)`.execute(db);
		await sql`
      CREATE TABLE task_series (
        id            text PRIMARY KEY,
        template      jsonb NOT NULL,
        rule_versions jsonb NOT NULL,
        revision      integer NOT NULL,
        CONSTRAINT task_series_revision_check CHECK (revision >= 0)
      )
    `.execute(db);
		await sql`
      CREATE TABLE task_occurrences (
        id                       text PRIMARY KEY,
        series_id                text REFERENCES task_series (id),
        nominal_date             date,
        rule_revision            integer,
        title                    text NOT NULL,
        notes                    text,
        start_time               text,
        end_time                 text,
        is_exception             boolean NOT NULL,
        created_sequence         bigint NOT NULL,
        state                    text NOT NULL,
        placement_kind           text NOT NULL,
        placement_date           date,
        planned_duration_minutes integer,
        completion               text,
        actual_completed_at      timestamptz,
        day_position             integer,
        revision                 integer NOT NULL,
        CONSTRAINT task_occurrences_state_check
          CHECK (state IN ('active', 'finalized', 'deleted')),
        CONSTRAINT task_occurrences_placement_kind_check
          CHECK (placement_kind IN ('day', 'backlog', 'none')),
        CONSTRAINT task_occurrences_completion_value_check
          CHECK (completion IS NULL OR completion IN ('incomplete', 'completed')),
        CONSTRAINT task_occurrences_revision_check CHECK (revision >= 0),
        CONSTRAINT task_occurrences_created_sequence_check CHECK (created_sequence > 0),
        CONSTRAINT task_occurrences_day_position_check
          CHECK (day_position IS NULL OR day_position >= 0),
        CONSTRAINT task_occurrences_duration_check
          CHECK (planned_duration_minutes IS NULL OR planned_duration_minutes > 0),
        -- A day placement carries its date; every other placement carries none.
        CONSTRAINT task_occurrences_placement_date_check
          CHECK ((placement_kind = 'day') = (placement_date IS NOT NULL)),
        -- Backlog tasks have no completion control (001 FR-010).
        CONSTRAINT task_occurrences_completion_scope_check
          CHECK (completion IS NULL OR (state = 'active' AND placement_kind = 'day')),
        -- Every dated active task has a positive planned duration (001 FR-005).
        CONSTRAINT task_occurrences_dated_duration_check
          CHECK (
            NOT (placement_kind = 'day' AND state = 'active')
            OR planned_duration_minutes IS NOT NULL
          ),
        CONSTRAINT task_occurrences_completed_at_check
          CHECK (
            (completion IS NOT DISTINCT FROM 'completed') = (actual_completed_at IS NOT NULL)
          )
      )
    `.execute(db);
		await sql`
      CREATE INDEX task_occurrences_day_order_idx
        ON task_occurrences (placement_kind, placement_date, day_position, created_sequence)
    `.execute(db);
		await sql`
      CREATE INDEX task_occurrences_placement_created_idx
        ON task_occurrences (placement_kind, created_sequence)
    `.execute(db);
		await sql`
      CREATE INDEX task_occurrences_series_date_idx ON task_occurrences (series_id, nominal_date)
    `.execute(db);
		await sql`
      CREATE TABLE task_plan_entries (
        id               text PRIMARY KEY,
        occurrence_id    text NOT NULL REFERENCES task_occurrences (id),
        plan_date        date NOT NULL,
        week_start       date NOT NULL REFERENCES weeks (start_date),
        planned_snapshot jsonb NOT NULL,
        entered_at       timestamptz NOT NULL,
        finalized_at     timestamptz,
        outcome          text NOT NULL,
        destination_kind text,
        destination_date date,
        CONSTRAINT task_plan_entries_outcome_check CHECK (
          outcome IN (
            'planned', 'completed', 'moved', 'backlogged',
            'canceled', 'kept-unfinished', 'deleted'
          )
        ),
        -- Only moved and backlogged carry a destination, and each carries its own kind.
        CONSTRAINT task_plan_entries_destination_check CHECK (
          (outcome = 'moved' AND destination_kind = 'day' AND destination_date IS NOT NULL) OR
          (outcome = 'backlogged' AND destination_kind = 'backlog' AND destination_date IS NULL) OR
          (
            outcome NOT IN ('moved', 'backlogged')
            AND destination_kind IS NULL
            AND destination_date IS NULL
          )
        ),
        -- 001 FR-040: a closure move must target a date other than the one being closed.
        CONSTRAINT task_plan_entries_destination_date_check
          CHECK (destination_date IS NULL OR destination_date <> plan_date),
        -- 001 FR-027, FR-048: at most one membership per occurrence per local date.
        CONSTRAINT task_plan_entries_occurrence_date_key UNIQUE (occurrence_id, plan_date)
      )
    `.execute(db);
		await sql`CREATE INDEX task_plan_entries_plan_date_idx ON task_plan_entries (plan_date)`.execute(db);
		await sql`
      CREATE INDEX task_plan_entries_week_start_idx ON task_plan_entries (week_start)
    `.execute(db);
		await sql`
      CREATE TABLE task_events (
        sequence       bigint PRIMARY KEY,
        id             text NOT NULL UNIQUE,
        occurrence_id  text REFERENCES task_occurrences (id),
        series_id      text REFERENCES task_series (id),
        effective_date date,
        occurred_at    timestamptz NOT NULL,
        payload        jsonb NOT NULL,
        CONSTRAINT task_events_sequence_check CHECK (sequence > 0)
      )
    `.execute(db);
		await sql`
      CREATE INDEX task_events_occurrence_idx ON task_events (occurrence_id, sequence)
    `.execute(db);
		await sql`CREATE INDEX task_events_series_idx ON task_events (series_id, sequence)`.execute(db);
		await sql`
      CREATE INDEX task_events_effective_date_idx ON task_events (effective_date, sequence)
    `.execute(db);
		await sql`
      CREATE TABLE habit_definitions (
        id            text PRIMARY KEY,
        title         text NOT NULL,
        rule_versions jsonb NOT NULL,
        revision      integer NOT NULL,
        CONSTRAINT habit_definitions_revision_check CHECK (revision >= 0)
      )
    `.execute(db);
		await sql`
      CREATE TABLE habit_occurrences (
        id                  text PRIMARY KEY,
        definition_id       text NOT NULL REFERENCES habit_definitions (id),
        date                date NOT NULL,
        week_start          date NOT NULL REFERENCES weeks (start_date),
        definition_snapshot jsonb NOT NULL,
        rule_revision       integer NOT NULL,
        is_exception        boolean NOT NULL,
        outcome             text NOT NULL,
        outcome_events      jsonb NOT NULL,
        updated_at          timestamptz NOT NULL,
        CONSTRAINT habit_occurrences_outcome_check
          CHECK (outcome IN ('pending', 'completed', 'not-completed', 'deleted')),
        CONSTRAINT habit_occurrences_rule_revision_check CHECK (rule_revision >= 0),
        -- One occurrence per habit per date (001 FR-016).
        CONSTRAINT habit_occurrences_definition_date_key UNIQUE (definition_id, date)
      )
    `.execute(db);
		await sql`CREATE INDEX habit_occurrences_date_idx ON habit_occurrences (date)`.execute(db);
		await sql`
      CREATE INDEX habit_occurrences_week_start_idx ON habit_occurrences (week_start)
    `.execute(db);
	},
	async down(db) {
		await sql`DROP TABLE IF EXISTS habit_occurrences`.execute(db);
		await sql`DROP TABLE IF EXISTS habit_definitions`.execute(db);
		await sql`DROP TABLE IF EXISTS task_events`.execute(db);
		await sql`DROP TABLE IF EXISTS task_plan_entries`.execute(db);
		await sql`DROP TABLE IF EXISTS task_occurrences`.execute(db);
		await sql`DROP TABLE IF EXISTS task_series`.execute(db);
		await sql`DROP TABLE IF EXISTS days`.execute(db);
		await sql`DROP TABLE IF EXISTS weeks`.execute(db);
	}
} });
function createMigrator(db) {
	return new Migrator({
		db,
		provider: { getMigrations: () => Promise.resolve({ ...MIGRATIONS }) }
	});
}
/**
* Applies every pending migration, throwing on the first failure so a server
* never starts serving requests against a half-migrated schema (FR-019).
*/
async function runMigrations(db) {
	const results = await createMigrator(db).migrateToLatest();
	if (results.error !== void 0) throw results.error instanceof Error ? results.error : /* @__PURE__ */ new Error(`Migration failed: ${JSON.stringify(results.error)}`);
	return results;
}
//#endregion
//#region server/planning/errors.ts
/**
* Carries a domain rejection out of a transaction body. Feature 001 models
* failures as values; throwing is only the transport that rolls the
* transaction back, and every catch site converts it straight back to a value.
*/
var DomainFailure = class extends Error {
	error;
	constructor(error) {
		super(error.code);
		this.error = error;
		this.name = "DomainFailure";
	}
};
function errorMessage(error) {
	if (error instanceof Error && error.message.length > 0) return error.message;
	return String(error);
}
/** PostgreSQL error classes that mean the database is not reachable. */
var UNAVAILABLE_CODE_PATTERN = /^(08|57P0|53)/;
var UNAVAILABLE_MESSAGE_PATTERN = /ECONNREFUSED|ECONNRESET|ETIMEDOUT|EPIPE|ENOTFOUND|Connection terminated|terminating connection|server closed the connection|Client has encountered a connection error|pool.*(ended|destroyed)|Cannot use a pool after calling end|driver has already been destroyed/i;
function postgresErrorCode(error) {
	if (typeof error !== "object" || error === null) return;
	const code = error.code;
	return typeof code === "string" ? code : void 0;
}
/**
* The server analogue of 001's `normalizeStorageError`. A database that cannot
* be reached is `ServerUnavailable`; anything else the server failed to handle
* is `UnexpectedServerFailure` (002 FR-014). Neither is ever reported as a
* domain outcome, so a failure is never presented as saved work.
*/
function normalizeServerError(error) {
	const code = postgresErrorCode(error);
	const message = errorMessage(error);
	if (code !== void 0 && UNAVAILABLE_CODE_PATTERN.test(code) || UNAVAILABLE_MESSAGE_PATTERN.test(message)) return {
		code: "ServerUnavailable",
		message
	};
	return {
		code: "UnexpectedServerFailure",
		message
	};
}
function toDomainOrServerError(error) {
	return error instanceof DomainFailure ? error.error : normalizeServerError(error);
}
function revisionGuard(actualRevision, expectedRevision) {
	return actualRevision === expectedRevision ? void 0 : {
		code: "RevisionConflict",
		expectedRevision,
		actualRevision
	};
}
function canonicalRequiredText(value, field) {
	const canonical = value.trim();
	if (canonical.length === 0) throw new DomainFailure({
		code: "ValidationFailure",
		issues: [{
			field,
			message: `${field} must not be blank`
		}]
	});
	return canonical;
}
function recurrenceValidationFailure(errors) {
	return new DomainFailure({
		code: "ValidationFailure",
		issues: errors.map((error) => ({
			field: error.field,
			message: error.code
		}))
	});
}
function habitTransitionFailure(error) {
	if (error.code === "PeriodImmutable") return new DomainFailure(error);
	return new DomainFailure({
		code: "InvalidTransition",
		entity: "HabitOccurrence",
		currentState: error.currentOutcome,
		attemptedTransition: error.attemptedTransition
	});
}
function dayClosureFailure(error) {
	switch (error.code) {
		case "PeriodImmutable":
		case "FutureDayClosure":
		case "PendingHabitOutcomes":
		case "ClosureDispositionMismatch":
		case "MoveTargetClosed": return new DomainFailure(error);
		case "InvalidClosureDestination":
			if (error.reason === "non-positive-duration" || error.reason === "invalid-day-position") return new DomainFailure({
				code: "ValidationFailure",
				issues: [{
					field: error.reason === "non-positive-duration" ? "durationMinutes" : "dayPosition",
					message: error.reason === "non-positive-duration" ? "Dated tasks require a positive duration" : "Dated tasks require a position"
				}]
			});
			return new DomainFailure({
				code: "InvalidTransition",
				entity: "TaskOccurrence",
				currentState: `day:${error.destinationDate}`,
				attemptedTransition: "closure-move-to-same-date"
			});
		case "InvalidClosureDisposition": return new DomainFailure({
			code: "InvalidTransition",
			entity: "TaskOccurrence",
			currentState: "incomplete",
			attemptedTransition: "close-day"
		});
		case "DestinationPlanEntryIdRequired":
		case "ClosureDataInvariant": return new DomainFailure({
			code: "UnexpectedServerFailure",
			message: error.code === "ClosureDataInvariant" ? error.message : `Destination membership ID missing for ${error.occurrenceId}`
		});
	}
}
function weekCompletionFailure(error) {
	switch (error.code) {
		case "PeriodImmutable":
		case "WeekNotClosable": return new DomainFailure(error);
		case "WeekDaysMismatch": return new DomainFailure({
			code: "UnexpectedServerFailure",
			message: `Week ${error.weekStart} does not own exactly its seven calendar days`
		});
	}
}
//#endregion
//#region server/planning/context.ts
function createRepositoryContext(dependencies) {
	return {
		clock: dependencies.clock,
		nextId: () => generateEntityId(dependencies.generateUuid)
	};
}
function requireOpenWeek(week, weekStart, expectedRevision) {
	if (week === void 0) throw new DomainFailure({
		code: "NotFound",
		entity: "Week",
		id: weekStart
	});
	if (week.status !== "open") throw new DomainFailure({
		code: "PeriodImmutable",
		weekStart
	});
	if (expectedRevision !== void 0) {
		const guard = revisionGuard(week.revision, expectedRevision);
		if (guard !== void 0) throw new DomainFailure(guard);
	}
}
function requireOpenDay(day, expectedRevision) {
	if (day.status !== "open") throw new DomainFailure({
		code: "PeriodImmutable",
		date: day.date
	});
	if (expectedRevision !== void 0) {
		const guard = revisionGuard(day.revision, expectedRevision);
		if (guard !== void 0) throw new DomainFailure(guard);
	}
}
//#endregion
//#region src/entities/planning/model/task.ts
var LOCAL_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
/** "HH:MM" 24-hour clock time, independent of calendar date. */
function isValidLocalTime(value) {
	return LOCAL_TIME_PATTERN.test(value);
}
/**
* Both fields are independently optional. When both are present, `endTime`
* must be strictly after `startTime` (same-day clock comparison only).
*/
function validateTaskTimeRange(startTime, endTime) {
	if (startTime !== void 0 && !isValidLocalTime(startTime)) return err({ code: "InvalidTimeRange" });
	if (endTime !== void 0 && !isValidLocalTime(endTime)) return err({ code: "InvalidTimeRange" });
	if (startTime !== void 0 && endTime !== void 0 && endTime <= startTime) return err({ code: "InvalidTimeRange" });
	return ok({
		...startTime === void 0 ? {} : { startTime },
		...endTime === void 0 ? {} : { endTime }
	});
}
function isDatedTaskOccurrence(occurrence) {
	return occurrence.state === "active" && occurrence.placement.kind === "day";
}
//#endregion
//#region src/entities/planning/model/history.ts
var COMMON_YEAR_MONTH_LENGTHS = [
	31,
	28,
	31,
	30,
	31,
	30,
	31,
	31,
	30,
	31,
	30,
	31
];
function isLeapYear(year) {
	return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}
function calendarMonthBounds(anchorDate) {
	const { year, month } = getLocalDateParts(anchorDate);
	const commonLength = COMMON_YEAR_MONTH_LENGTHS[month - 1];
	const length = month === 2 && isLeapYear(year) ? 29 : commonLength;
	return {
		monthStart: localDateFromParts(year, month, 1),
		monthEnd: localDateFromParts(year, month, length)
	};
}
function inclusiveDates(startDate, endDate) {
	const dates = [];
	let current = startDate;
	while (compareLocalDates(current, endDate) <= 0) {
		dates.push(current);
		if (current === endDate) break;
		current = addDays(current, 1);
	}
	return dates;
}
/** Derives one exact indexed range; callers cannot supply arbitrary bounds. */
function deriveHistoryDateRange(selection) {
	if (selection.mode === "day") return {
		mode: selection.mode,
		anchorDate: selection.anchorDate,
		startDate: selection.anchorDate,
		endDate: selection.anchorDate,
		dates: [selection.anchorDate]
	};
	if (selection.mode === "week") {
		const weekStart = startOfWeek(selection.anchorDate);
		const dates = weekDates(weekStart);
		return {
			mode: selection.mode,
			anchorDate: selection.anchorDate,
			startDate: weekStart,
			endDate: dates[6],
			dates,
			weekStart
		};
	}
	const { monthStart, monthEnd } = calendarMonthBounds(selection.anchorDate);
	if (compareLocalDates(selection.selectedDate, monthStart) < 0 || compareLocalDates(selection.selectedDate, monthEnd) > 0) throw new RangeError(`Selected date ${selection.selectedDate} does not belong to month ${monthStart}`);
	return {
		mode: selection.mode,
		anchorDate: selection.anchorDate,
		selectedDate: selection.selectedDate,
		startDate: monthStart,
		endDate: monthEnd,
		dates: inclusiveDates(monthStart, monthEnd),
		monthStart,
		monthEnd
	};
}
/**
* Membership order is independent of current placement and audit order. Local
* date is the historical axis; immutable entry facts make ties deterministic.
*/
function orderTaskMemberships(memberships) {
	return memberships.toSorted((left, right) => {
		const byDate = left.date.localeCompare(right.date);
		if (byDate !== 0) return byDate;
		const byEnteredAt = left.enteredAt.localeCompare(right.enteredAt);
		return byEnteredAt !== 0 ? byEnteredAt : left.id.localeCompare(right.id);
	});
}
/** Persisted EventSequence is authoritative even when timestamps are equal. */
function orderTaskEvents(events) {
	return events.toSorted((left, right) => {
		const bySequence = left.sequence - right.sequence;
		return bySequence !== 0 ? bySequence : left.id.localeCompare(right.id);
	});
}
function membershipDisposition(membership) {
	return {
		outcome: membership.outcome,
		...membership.outcome === "moved" || membership.outcome === "backlogged" ? { destination: membership.destination } : {},
		...membership.finalizedAt === void 0 ? {} : { finalizedAt: membership.finalizedAt }
	};
}
function isCurrentDatedMembership(occurrence, membership) {
	return isDatedTaskOccurrence(occurrence) && occurrence.placement.date === membership.date;
}
function membershipActual(occurrence, membership, isCurrentPlacement) {
	if (membership.outcome === "deleted") return { outcome: "excluded" };
	if (membership.outcome !== "completed") return { outcome: "incomplete" };
	return isCurrentPlacement && isDatedTaskOccurrence(occurrence) && occurrence.completion === "completed" ? {
		outcome: "completed",
		completedAt: occurrence.actualCompletedAt
	} : { outcome: "completed" };
}
function explainTaskMembership(occurrence, membership) {
	if (membership.occurrenceId !== occurrence.id) throw new RangeError(`Membership ${membership.id} does not belong to occurrence ${occurrence.id}`);
	const isCurrentPlacement = isCurrentDatedMembership(occurrence, membership);
	return {
		membership,
		planned: membership.plannedSnapshot,
		disposition: membershipDisposition(membership),
		actual: membershipActual(occurrence, membership, isCurrentPlacement),
		isCurrentPlacement
	};
}
//#endregion
//#region src/entities/planning/model/habit.ts
function immutableError(occurrence) {
	return {
		code: "PeriodImmutable",
		date: occurrence.date
	};
}
function invalidTransition(occurrence, attemptedTransition) {
	return {
		code: "InvalidTransition",
		currentOutcome: occurrence.outcome,
		attemptedTransition
	};
}
function nextOutcomeOrdinal(events) {
	const latest = events.reduce((maximum, event) => Math.max(maximum, event.ordinal), 0);
	if (latest >= Number.MAX_SAFE_INTEGER) throw new RangeError("Habit outcome ordinal cannot exceed Number.MAX_SAFE_INTEGER");
	return latest + 1;
}
function recordHabitOutcome$1(input) {
	if (input.dayStatus === "closed") return err(immutableError(input.occurrence));
	if (input.occurrence.outcome !== "pending") return err(invalidTransition(input.occurrence, `record-${input.outcome}`));
	const occurredAt = input.clock.now();
	const event = {
		ordinal: nextOutcomeOrdinal(input.occurrence.outcomeEvents),
		occurredAt,
		source: "user",
		outcome: input.outcome
	};
	return ok({
		changed: true,
		occurrence: {
			...input.occurrence,
			outcome: input.outcome,
			outcomeEvents: [...input.occurrence.outcomeEvents, event],
			updatedAt: occurredAt
		}
	});
}
/**
* Undoes the user's own mark while the day is still open, returning the
* occurrence to pending. An automatic date-boundary miss is not a user mark,
* so it is corrected through `correctBoundaryMissToCompleted` instead.
*/
function clearHabitOutcome$1(input) {
	if (input.dayStatus === "closed") return err(immutableError(input.occurrence));
	const latestEvent = input.occurrence.outcomeEvents.at(-1);
	const isUserMark = latestEvent?.source === "user" || latestEvent?.source === "user-correction";
	if (input.occurrence.outcome !== "completed" && input.occurrence.outcome !== "not-completed" || !isUserMark) return err(invalidTransition(input.occurrence, "clear-outcome"));
	const occurredAt = input.clock.now();
	const event = {
		ordinal: nextOutcomeOrdinal(input.occurrence.outcomeEvents),
		occurredAt,
		source: "user-cleared",
		outcome: "pending"
	};
	return ok({
		changed: true,
		occurrence: {
			...input.occurrence,
			outcome: "pending",
			outcomeEvents: [...input.occurrence.outcomeEvents, event],
			updatedAt: occurredAt
		}
	});
}
function catchUpHabitDateBoundary(input) {
	if (input.dayStatus === "closed") return err(immutableError(input.occurrence));
	if (input.occurrence.outcome !== "pending" || compareLocalDates(input.occurrence.date, input.clock.currentLocalDate()) >= 0) return ok({
		occurrence: input.occurrence,
		changed: false
	});
	const occurredAt = input.clock.now();
	const event = {
		ordinal: nextOutcomeOrdinal(input.occurrence.outcomeEvents),
		occurredAt,
		source: "date-boundary",
		outcome: "not-completed"
	};
	return ok({
		changed: true,
		occurrence: {
			...input.occurrence,
			outcome: "not-completed",
			outcomeEvents: [...input.occurrence.outcomeEvents, event],
			updatedAt: occurredAt
		}
	});
}
function correctBoundaryMissToCompleted$1(input) {
	if (input.dayStatus === "closed") return err(immutableError(input.occurrence));
	const latestEvent = input.occurrence.outcomeEvents.at(-1);
	if (input.occurrence.outcome !== "not-completed" || latestEvent?.source !== "date-boundary") return err(invalidTransition(input.occurrence, "correct-boundary-miss-to-completed"));
	const occurredAt = input.clock.now();
	const event = {
		ordinal: nextOutcomeOrdinal(input.occurrence.outcomeEvents),
		occurredAt,
		source: "user-correction",
		outcome: "completed"
	};
	return ok({
		changed: true,
		occurrence: {
			...input.occurrence,
			outcome: "completed",
			outcomeEvents: [...input.occurrence.outcomeEvents, event],
			updatedAt: occurredAt
		}
	});
}
function deleteHabitOccurrence$2(input) {
	if (input.dayStatus === "closed") return err(immutableError(input.occurrence));
	if (input.occurrence.outcome === "deleted") return err(invalidTransition(input.occurrence, "delete"));
	return ok({
		changed: true,
		occurrence: {
			...input.occurrence,
			outcome: "deleted",
			updatedAt: input.clock.now()
		}
	});
}
function isHabitOccurrenceApplicable(occurrence) {
	return occurrence.outcome !== "deleted";
}
/** Equal-weight applicable habit facts for one local date. */
function habitCompletionCounts(occurrences, date) {
	const applicable = occurrences.filter((occurrence) => occurrence.date === date && isHabitOccurrenceApplicable(occurrence));
	return {
		completed: applicable.filter((occurrence) => occurrence.outcome === "completed").length,
		applicable: applicable.length
	};
}
//#endregion
//#region src/entities/planning/model/planned-load.ts
/**
* Factual current load only: no capacity, threshold, classification, or warning.
*/
function calculatePlannedLoad(occurrences, date) {
	return nonNegativeDurationMinutes(occurrences.reduce((total, occurrence) => {
		if (!isDatedTaskOccurrence(occurrence) || occurrence.placement.date !== date) return total;
		return total + occurrence.plannedDurationMinutes;
	}, 0));
}
//#endregion
//#region src/entities/planning/model/scoring.ts
function requireValidCounts(category, counts) {
	if (!isNonNegativeInteger(counts.completed) || !isNonNegativeInteger(counts.applicable)) throw new RangeError(`${category} completion counts must be non-negative safe integers`);
	if (counts.completed > counts.applicable) throw new RangeError(`${category} completed count cannot exceed its applicable count`);
}
function categoryBreakdown(counts) {
	if (counts.applicable === 0) return {
		completed: 0,
		applicable: 0,
		rate: "unavailable"
	};
	return {
		completed: counts.completed,
		applicable: counts.applicable,
		rate: counts.completed / counts.applicable
	};
}
/** Rounds a non-negative rational percentage exactly, including .5 ties. */
function roundHalfUp(numerator, denominator) {
	return Number((2n * numerator + denominator) / (2n * denominator));
}
function taskOnlyValue(task) {
	return roundHalfUp(100n * BigInt(task.completed), BigInt(task.applicable));
}
function habitOnlyValue(habit) {
	return roundHalfUp(100n * BigInt(habit.completed), BigInt(habit.applicable));
}
function combinedValue(task, habit) {
	const taskApplicable = BigInt(task.applicable);
	const habitApplicable = BigInt(habit.applicable);
	return roundHalfUp(70n * BigInt(task.completed) * habitApplicable + 30n * BigInt(habit.completed) * taskApplicable, taskApplicable * habitApplicable);
}
/** Shared Daily Score and Weekly Progress policy. Rates are ratios; value is a percentage. */
function calculateCompletionScore(input) {
	requireValidCounts("task", input.task);
	requireValidCounts("habit", input.habit);
	const task = categoryBreakdown(input.task);
	const habit = categoryBreakdown(input.habit);
	const hasTask = task.rate !== "unavailable";
	const hasHabit = habit.rate !== "unavailable";
	if (!hasTask && !hasHabit) return {
		task,
		habit,
		value: "unavailable",
		weightsApplied: {
			task: 0,
			habit: 0
		}
	};
	if (hasTask && !hasHabit) return {
		task,
		habit,
		value: taskOnlyValue(input.task),
		weightsApplied: {
			task: 100,
			habit: 0
		}
	};
	if (!hasTask && hasHabit) return {
		task,
		habit,
		value: habitOnlyValue(input.habit),
		weightsApplied: {
			task: 0,
			habit: 100
		}
	};
	return {
		task,
		habit,
		value: combinedValue(input.task, input.habit),
		weightsApplied: {
			task: 70,
			habit: 30
		}
	};
}
//#endregion
//#region src/entities/planning/model/week.ts
function isCompletedWeek(week) {
	return week.status === "completed";
}
//#endregion
//#region src/entities/planning/model/selectors.ts
function taskCompletionCounts(planEntries, date) {
	const applicable = planEntries.filter((entry) => entry.date === date && entry.outcome !== "deleted");
	return {
		completed: applicable.filter((entry) => entry.outcome === "completed").length,
		applicable: applicable.length
	};
}
/**
* Selects live facts for an open Day and the immutable closure snapshot for a
* closed Day. Daily State is retained as context on `day`, never as score/load
* input.
*/
function selectDaySignals(input) {
	if (input.day.status === "closed") return {
		day: input.day,
		calculation: "frozen",
		score: input.day.closureSnapshot.score,
		plannedLoadMinutes: input.day.closureSnapshot.plannedLoadMinutes
	};
	return {
		day: input.day,
		calculation: "live",
		score: calculateCompletionScore({
			task: taskCompletionCounts(input.planEntries, input.day.date),
			habit: habitCompletionCounts(input.habits ?? [], input.day.date)
		}),
		plannedLoadMinutes: calculatePlannedLoad(input.occurrences, input.day.date)
	};
}
function uniqueDayForDate(days, date) {
	const matches = days.filter((day) => day.date === date);
	if (matches.length > 1) throw new RangeError(`Duplicate Day ${date}`);
	return matches[0];
}
function uniqueWeekForStart(weeks, startDate) {
	const matches = weeks.filter((week) => week.startDate === startDate);
	if (matches.length > 1) throw new RangeError(`Duplicate Week ${startDate}`);
	return matches[0];
}
function occurrenceIndex(occurrences) {
	const result = /* @__PURE__ */ new Map();
	for (const occurrence of occurrences) {
		if (result.has(occurrence.id)) throw new RangeError(`Duplicate task occurrence ${occurrence.id}`);
		result.set(occurrence.id, occurrence);
	}
	return result;
}
function historicalTasksForDate(input, date, occurrencesById) {
	const memberships = orderTaskMemberships(input.taskPlanEntries.filter((membership) => membership.date === date));
	const membershipOccurrences = /* @__PURE__ */ new Set();
	return memberships.map((membership) => {
		if (membershipOccurrences.has(membership.occurrenceId)) throw new RangeError(`Occurrence ${membership.occurrenceId} has duplicate membership for ${date}`);
		membershipOccurrences.add(membership.occurrenceId);
		const occurrence = occurrencesById.get(membership.occurrenceId);
		if (occurrence === void 0) throw new RangeError(`Membership ${membership.id} has no task occurrence`);
		return {
			occurrence,
			membership,
			events: orderTaskEvents(input.taskEvents.filter((event) => event.occurrenceId === occurrence.id)),
			explanation: explainTaskMembership(occurrence, membership)
		};
	});
}
function historicalHabitsForDate(occurrences, date) {
	return occurrences.filter((occurrence) => occurrence.date === date).map((occurrence) => ({
		...occurrence,
		outcomeEvents: occurrence.outcomeEvents.toSorted((left, right) => {
			const byOrdinal = left.ordinal - right.ordinal;
			return byOrdinal !== 0 ? byOrdinal : left.occurredAt.localeCompare(right.occurredAt);
		})
	})).toSorted((left, right) => {
		const byDefinition = left.definitionId.localeCompare(right.definitionId);
		return byDefinition !== 0 ? byDefinition : left.id.localeCompare(right.id);
	});
}
function historicalDayFacts(input, date, occurrencesById) {
	const day = uniqueDayForDate(input.days, date) ?? createOpenDay(date);
	const signals = selectDaySignals({
		day,
		occurrences: input.taskOccurrences,
		planEntries: input.taskPlanEntries,
		habits: input.habitOccurrences
	});
	return {
		day,
		tasks: historicalTasksForDate(input, date, occurrencesById),
		habits: historicalHabitsForDate(input.habitOccurrences, date),
		score: signals.score,
		plannedLoadMinutes: signals.plannedLoadMinutes
	};
}
function addCompletionCounts(left, right) {
	return {
		completed: left.completed + right.completed,
		applicable: left.applicable + right.applicable
	};
}
function aggregateHistoricalProgress(days) {
	return calculateCompletionScore(days.reduce((total, facts) => ({
		task: addCompletionCounts(total.task, facts.score.task),
		habit: addCompletionCounts(total.habit, facts.score.habit)
	}), {
		task: {
			completed: 0,
			applicable: 0
		},
		habit: {
			completed: 0,
			applicable: 0
		}
	}));
}
function emptyWeek(startDate) {
	return {
		startDate,
		goals: [],
		status: "open",
		revision: INITIAL_REVISION
	};
}
function historicalWeekFacts(input, week, occurrencesById) {
	const days = weekDates(week.startDate).map((date) => historicalDayFacts(input, date, occurrencesById));
	return {
		week,
		days,
		progress: week.status === "completed" ? week.completionSnapshot.progress : aggregateHistoricalProgress(days),
		...week.reflection === void 0 ? {} : { reflection: week.reflection }
	};
}
function dateIsInside(date, startDate, endDate) {
	return compareLocalDates(date, startDate) >= 0 && compareLocalDates(date, endDate) <= 0;
}
/**
* Builds immutable Day, Week, or Month facts from normalized records. Audit
* events explain memberships but never create additional scoring records.
*/
function selectHistoryView(input) {
	const range = deriveHistoryDateRange(input.query);
	const occurrencesById = occurrenceIndex(input.taskOccurrences);
	if (range.mode === "day") return {
		mode: range.mode,
		anchorDate: range.anchorDate,
		facts: historicalDayFacts(input, range.anchorDate, occurrencesById)
	};
	if (range.mode === "week") {
		const week = uniqueWeekForStart(input.weeks, range.weekStart) ?? emptyWeek(range.weekStart);
		return {
			mode: range.mode,
			anchorDate: range.anchorDate,
			weekStart: range.weekStart,
			facts: historicalWeekFacts(input, week, occurrencesById)
		};
	}
	const calendar = range.dates.map((date) => {
		const day = uniqueDayForDate(input.days, date);
		if (day === void 0) return {
			date,
			belongsToMonth: true
		};
		const facts = historicalDayFacts(input, date, occurrencesById);
		return {
			date,
			belongsToMonth: true,
			dayStatus: day.status,
			score: facts.score
		};
	});
	const completedWeeks = input.weeks.filter((week) => isCompletedWeek(week) && weekDates(week.startDate).every((date) => dateIsInside(date, range.monthStart, range.monthEnd))).toSorted((left, right) => compareLocalDates(left.startDate, right.startDate)).map((week) => historicalWeekFacts(input, week, occurrencesById));
	return {
		mode: range.mode,
		anchorDate: range.anchorDate,
		monthStart: range.monthStart,
		monthEnd: range.monthEnd,
		selectedDate: range.selectedDate,
		calendar,
		selectedDay: historicalDayFacts(input, range.selectedDate, occurrencesById),
		completedWeeks
	};
}
//#endregion
//#region server/planning/mappers.ts
/**
* A `?` domain field is `undefined`, never `null`. Emitting `null` instead
* would change deep-equality results across the whole feature-001 suite, so
* every optional field goes through here on the way out of a row.
*/
function optional(key, value) {
	const result = {};
	if (value !== null && value !== void 0) result[key] = value;
	return result;
}
function nullable(value) {
	return value ?? null;
}
function json(value) {
	return JSON.stringify(value);
}
/**
* Drops the key column from a row's values so the remainder can be used as an
* `UPDATE ... SET` payload without restating the identity being matched on.
*/
function withoutKey(values, key) {
	return Object.fromEntries(Object.entries(values).filter(([name]) => name !== key));
}
function nullableJson(value) {
	return value === void 0 ? null : json(value);
}
function toWeekValues(week) {
	const base = {
		start_date: week.startDate,
		goals: json(week.goals),
		reflection: nullable(week.reflection),
		revision: week.revision
	};
	switch (week.status) {
		case "open": return {
			...base,
			status: "open",
			completion_snapshot: null,
			completed_at: null
		};
		case "completed": return {
			...base,
			status: "completed",
			completion_snapshot: json(week.completionSnapshot),
			completed_at: week.completedAt
		};
		default: return assertNever(week);
	}
}
function fromWeekRow(row) {
	const base = {
		startDate: row.start_date,
		goals: row.goals,
		revision: row.revision,
		...optional("reflection", row.reflection)
	};
	if (row.status === "completed") {
		if (row.completion_snapshot === null || row.completed_at === null) throw new Error(`Completed week ${row.start_date} is missing its frozen snapshot`);
		return {
			...base,
			status: "completed",
			completionSnapshot: row.completion_snapshot,
			completedAt: row.completed_at
		};
	}
	return {
		...base,
		status: "open"
	};
}
function toDayValues(day) {
	const base = {
		date: day.date,
		week_start: day.weekStart,
		state: nullableJson(day.state),
		revision: day.revision
	};
	switch (day.status) {
		case "open": return {
			...base,
			status: "open",
			closure_snapshot: null,
			closed_at: null
		};
		case "closed": return {
			...base,
			status: "closed",
			closure_snapshot: json(day.closureSnapshot),
			closed_at: day.closedAt
		};
		default: return assertNever(day);
	}
}
function fromDayRow(row) {
	const base = {
		date: row.date,
		weekStart: row.week_start,
		revision: row.revision,
		...optional("state", row.state)
	};
	if (row.status === "closed") {
		if (row.closure_snapshot === null || row.closed_at === null) throw new Error(`Closed day ${row.date} is missing its closure snapshot`);
		return {
			...base,
			status: "closed",
			closureSnapshot: row.closure_snapshot,
			closedAt: row.closed_at
		};
	}
	return {
		...base,
		status: "open"
	};
}
function toTaskSeriesValues(series) {
	return {
		id: series.id,
		template: json(series.template),
		rule_versions: json(series.ruleVersions),
		revision: series.revision
	};
}
function fromTaskSeriesRow(row) {
	return {
		id: row.id,
		template: row.template,
		ruleVersions: row.rule_versions,
		revision: row.revision
	};
}
function toTaskOccurrenceValues(occurrence) {
	const base = {
		id: occurrence.id,
		series_id: nullable(occurrence.seriesId),
		nominal_date: nullable(occurrence.nominalDate),
		rule_revision: nullable(occurrence.ruleRevision),
		title: occurrence.title,
		notes: nullable(occurrence.notes),
		start_time: nullable(occurrence.startTime),
		end_time: nullable(occurrence.endTime),
		is_exception: occurrence.isException,
		created_sequence: occurrence.createdSequence,
		planned_duration_minutes: nullable(occurrence.plannedDurationMinutes),
		revision: occurrence.revision
	};
	switch (occurrence.state) {
		case "active": {
			if (occurrence.placement.kind === "backlog") return {
				...base,
				state: "active",
				placement_kind: "backlog",
				placement_date: null,
				completion: null,
				actual_completed_at: null,
				day_position: null
			};
			const dated = occurrence;
			return {
				...base,
				state: "active",
				placement_kind: "day",
				placement_date: dated.placement.date,
				planned_duration_minutes: dated.plannedDurationMinutes,
				day_position: nullable(dated.dayPosition),
				...dated.completion === "completed" ? {
					completion: "completed",
					actual_completed_at: dated.actualCompletedAt
				} : {
					completion: "incomplete",
					actual_completed_at: null
				}
			};
		}
		case "finalized":
		case "deleted": return {
			...base,
			state: occurrence.state,
			placement_kind: "none",
			placement_date: null,
			completion: null,
			actual_completed_at: null,
			day_position: null
		};
		default: return assertNever(occurrence);
	}
}
function fromTaskOccurrenceRow(row) {
	const base = {
		id: row.id,
		...optional("seriesId", row.series_id),
		...optional("nominalDate", row.nominal_date),
		...optional("ruleRevision", row.rule_revision),
		title: row.title,
		...optional("notes", row.notes),
		...optional("startTime", row.start_time),
		...optional("endTime", row.end_time),
		isException: row.is_exception,
		createdSequence: row.created_sequence,
		revision: row.revision
	};
	if (row.state === "finalized" || row.state === "deleted") return {
		...base,
		state: row.state,
		placement: { kind: "none" },
		...optional("plannedDurationMinutes", row.planned_duration_minutes)
	};
	if (row.placement_kind === "backlog") return {
		...base,
		state: "active",
		placement: { kind: "backlog" },
		...optional("plannedDurationMinutes", row.planned_duration_minutes)
	};
	if (row.placement_date === null || row.planned_duration_minutes === null) throw new Error(`Dated task ${row.id} is missing its date or planned duration`);
	const dated = {
		...base,
		state: "active",
		placement: {
			kind: "day",
			date: row.placement_date
		},
		plannedDurationMinutes: row.planned_duration_minutes,
		...optional("dayPosition", row.day_position)
	};
	if (row.completion === "completed") {
		if (row.actual_completed_at === null) throw new Error(`Completed task ${row.id} is missing its completion instant`);
		return {
			...dated,
			completion: "completed",
			actualCompletedAt: row.actual_completed_at
		};
	}
	return {
		...dated,
		completion: "incomplete"
	};
}
function toTaskPlanEntryValues(entry) {
	const base = {
		id: entry.id,
		occurrence_id: entry.occurrenceId,
		plan_date: entry.date,
		week_start: entry.weekStart,
		planned_snapshot: json(entry.plannedSnapshot),
		entered_at: entry.enteredAt,
		finalized_at: nullable(entry.finalizedAt)
	};
	switch (entry.outcome) {
		case "moved": return {
			...base,
			outcome: "moved",
			destination_kind: "day",
			destination_date: entry.destination.date
		};
		case "backlogged": return {
			...base,
			outcome: "backlogged",
			destination_kind: "backlog",
			destination_date: null
		};
		case "planned":
		case "completed":
		case "canceled":
		case "kept-unfinished":
		case "deleted": return {
			...base,
			outcome: entry.outcome,
			destination_kind: null,
			destination_date: null
		};
		default: return assertNever(entry);
	}
}
function fromTaskPlanEntryRow(row) {
	const base = {
		id: row.id,
		occurrenceId: row.occurrence_id,
		date: row.plan_date,
		weekStart: row.week_start,
		plannedSnapshot: row.planned_snapshot,
		enteredAt: row.entered_at,
		...optional("finalizedAt", row.finalized_at)
	};
	switch (row.outcome) {
		case "moved":
			if (row.destination_date === null) throw new Error(`Moved membership ${row.id} is missing its destination date`);
			return {
				...base,
				outcome: "moved",
				destination: {
					kind: "day",
					date: row.destination_date
				}
			};
		case "backlogged": return {
			...base,
			outcome: "backlogged",
			destination: { kind: "backlog" }
		};
		case "planned":
		case "completed":
		case "canceled":
		case "kept-unfinished":
		case "deleted": return {
			...base,
			outcome: row.outcome
		};
		default: return assertNever(row.outcome);
	}
}
function toTaskEventValues(event) {
	const body = {
		type: event.type,
		...optional("planEntryId", event.planEntryId),
		payload: event.payload
	};
	return {
		sequence: event.sequence,
		id: event.id,
		occurrence_id: event.occurrenceId,
		series_id: nullable(event.seriesId),
		effective_date: event.effectiveDate,
		occurred_at: event.occurredAt,
		payload: json(body)
	};
}
function fromTaskEventRow(row) {
	if (row.occurrence_id === null || row.effective_date === null) throw new Error(`Audit event ${row.id} is missing its occurrence or effective date`);
	const body = row.payload;
	return {
		id: row.id,
		sequence: row.sequence,
		occurrenceId: row.occurrence_id,
		...optional("seriesId", row.series_id),
		...optional("planEntryId", body.planEntryId),
		effectiveDate: row.effective_date,
		occurredAt: row.occurred_at,
		type: body.type,
		payload: body.payload
	};
}
function toHabitDefinitionValues(definition) {
	return {
		id: definition.id,
		title: definition.title,
		rule_versions: json(definition.ruleVersions),
		revision: definition.revision
	};
}
function fromHabitDefinitionRow(row) {
	return {
		id: row.id,
		title: row.title,
		ruleVersions: row.rule_versions,
		revision: row.revision
	};
}
function toHabitOccurrenceValues(occurrence) {
	return {
		id: occurrence.id,
		definition_id: occurrence.definitionId,
		date: occurrence.date,
		week_start: occurrence.weekStart,
		definition_snapshot: json(occurrence.definitionSnapshot),
		rule_revision: occurrence.ruleRevision,
		is_exception: occurrence.isException,
		outcome: occurrence.outcome,
		outcome_events: json(occurrence.outcomeEvents),
		updated_at: occurrence.updatedAt
	};
}
function fromHabitOccurrenceRow(row) {
	return {
		id: row.id,
		definitionId: row.definition_id,
		date: row.date,
		weekStart: row.week_start,
		definitionSnapshot: row.definition_snapshot,
		ruleRevision: row.rule_revision,
		isException: row.is_exception,
		outcome: row.outcome,
		outcomeEvents: row.outcome_events,
		updatedAt: row.updated_at
	};
}
//#endregion
//#region server/planning/store.ts
/**
* Reports the conflict with the revision actually stored, which is what
* feature 001's `RevisionConflict` payload has always carried.
*/
async function conflict(actualRevision, expectedRevision) {
	if (actualRevision === void 0) throw new DomainFailure({
		code: "UnexpectedServerFailure",
		message: "A guarded update targeted a row that no longer exists"
	});
	return Promise.reject(new DomainFailure({
		code: "RevisionConflict",
		expectedRevision,
		actualRevision
	}));
}
async function getWeek(x, startDate) {
	const row = await x.selectFrom("weeks").selectAll().where("start_date", "=", startDate).executeTakeFirst();
	return row === void 0 ? void 0 : fromWeekRow(row);
}
async function getWeeksByStarts(x, starts) {
	if (starts.length === 0) return [];
	return (await x.selectFrom("weeks").selectAll().where("start_date", "in", [...starts]).orderBy("start_date").execute()).map(fromWeekRow);
}
async function insertWeek(x, week) {
	await x.insertInto("weeks").values(toWeekValues(week)).execute();
}
async function putWeek(x, week, expected) {
	const values = withoutKey(toWeekValues(week), "start_date");
	const result = await x.updateTable("weeks").set(values).where("start_date", "=", week.startDate).where("revision", "=", expected).executeTakeFirst();
	if (Number(result.numUpdatedRows) === 0) await conflict((await getWeek(x, week.startDate))?.revision, expected);
}
async function getDay(x, date) {
	const row = await x.selectFrom("days").selectAll().where("date", "=", date).executeTakeFirst();
	return row === void 0 ? void 0 : fromDayRow(row);
}
/** Replaces the `days` `by-weekStart` index. */
async function getDaysByWeekStart(x, weekStart) {
	return (await x.selectFrom("days").selectAll().where("week_start", "=", weekStart).orderBy("date").execute()).map(fromDayRow);
}
/** Replaces a bounded primary-key range scan over `days`. */
async function getDaysInRange(x, startDate, endDate) {
	return (await x.selectFrom("days").selectAll().where("date", ">=", startDate).where("date", "<=", endDate).orderBy("date").execute()).map(fromDayRow);
}
async function insertDay(x, day) {
	await x.insertInto("days").values(toDayValues(day)).execute();
}
async function putDay(x, day, expected) {
	const values = withoutKey(toDayValues(day), "date");
	const result = await x.updateTable("days").set(values).where("date", "=", day.date).where("revision", "=", expected).executeTakeFirst();
	if (Number(result.numUpdatedRows) === 0) await conflict((await getDay(x, day.date))?.revision, expected);
}
/** Replaces `taskSeries.getAll()`, which yields primary-key order. */
async function getAllTaskSeries(x) {
	return (await x.selectFrom("task_series").selectAll().orderBy("id").execute()).map(fromTaskSeriesRow);
}
async function getTaskSeries(x, id) {
	const row = await x.selectFrom("task_series").selectAll().where("id", "=", id).executeTakeFirst();
	return row === void 0 ? void 0 : fromTaskSeriesRow(row);
}
async function insertTaskSeries(x, series) {
	await x.insertInto("task_series").values(toTaskSeriesValues(series)).execute();
}
async function putTaskSeries(x, series, expected) {
	const values = withoutKey(toTaskSeriesValues(series), "id");
	const result = await x.updateTable("task_series").set(values).where("id", "=", series.id).where("revision", "=", expected).executeTakeFirst();
	if (Number(result.numUpdatedRows) === 0) await conflict((await getTaskSeries(x, series.id))?.revision, expected);
}
async function getTaskOccurrence(x, id) {
	const row = await x.selectFrom("task_occurrences").selectAll().where("id", "=", id).executeTakeFirst();
	return row === void 0 ? void 0 : fromTaskOccurrenceRow(row);
}
async function getTaskOccurrencesByIds(x, ids) {
	if (ids.length === 0) return [];
	return (await x.selectFrom("task_occurrences").selectAll().where("id", "in", ids).orderBy("id").execute()).map(fromTaskOccurrenceRow);
}
/** Replaces the `by-placement-created` range scan for one dated day. */
async function getTaskOccurrencesPlacedOn(x, date) {
	return (await x.selectFrom("task_occurrences").selectAll().where("placement_kind", "=", "day").where("placement_date", "=", date).orderBy("created_sequence").execute()).map(fromTaskOccurrenceRow);
}
/** Replaces the `by-placement-created` range scan for the backlog. */
async function getBacklogTaskOccurrences(x) {
	return (await x.selectFrom("task_occurrences").selectAll().where("placement_kind", "=", "backlog").orderBy("created_sequence").execute()).map(fromTaskOccurrenceRow);
}
/** Replaces the `by-series-date` index lookup. */
async function getTaskOccurrenceBySeriesDate(x, seriesId, nominalDate) {
	const row = await x.selectFrom("task_occurrences").selectAll().where("series_id", "=", seriesId).where("nominal_date", "=", nominalDate).executeTakeFirst();
	return row === void 0 ? void 0 : fromTaskOccurrenceRow(row);
}
/**
* Replaces `allocateNextCreationSequence`: the reverse cursor over the
* `by-created-sequence` index. Allocating `max + 1` inside the command
* transaction keeps the sequence gap-free exactly as feature 001's did — a
* PostgreSQL sequence would advance on rollback and change the values 001's
* suites assert on.
*/
async function maxCreatedSequence(x) {
	const row = await x.selectFrom("task_occurrences").select(({ fn }) => fn.max("created_sequence").as("value")).executeTakeFirst();
	return row?.value == null ? 0 : Number(row.value);
}
async function insertTaskOccurrence(x, occurrence) {
	await x.insertInto("task_occurrences").values(toTaskOccurrenceValues(occurrence)).execute();
}
async function putTaskOccurrence(x, occurrence, expected) {
	const values = withoutKey(toTaskOccurrenceValues(occurrence), "id");
	const result = await x.updateTable("task_occurrences").set(values).where("id", "=", occurrence.id).where("revision", "=", expected).executeTakeFirst();
	if (Number(result.numUpdatedRows) === 0) await conflict((await getTaskOccurrence(x, occurrence.id))?.revision, expected);
}
async function deleteTaskOccurrence$1(x, id) {
	await x.deleteFrom("task_occurrences").where("id", "=", id).execute();
}
/** Replaces the `by-occurrence-date` index lookup. */
async function getPlanEntryByOccurrenceDate(x, occurrenceId, date) {
	const row = await x.selectFrom("task_plan_entries").selectAll().where("occurrence_id", "=", occurrenceId).where("plan_date", "=", date).executeTakeFirst();
	return row === void 0 ? void 0 : fromTaskPlanEntryRow(row);
}
/** Replaces the `by-occurrence-date` bounded range scan for one occurrence. */
async function getPlanEntriesByOccurrence(x, occurrenceId) {
	return (await x.selectFrom("task_plan_entries").selectAll().where("occurrence_id", "=", occurrenceId).orderBy("plan_date").execute()).map(fromTaskPlanEntryRow);
}
/** Replaces the `by-date` index lookup. */
async function getPlanEntriesByDate(x, date) {
	return (await x.selectFrom("task_plan_entries").selectAll().where("plan_date", "=", date).orderBy("id").execute()).map(fromTaskPlanEntryRow);
}
/** Replaces the `by-date` bounded range scan. */
async function getPlanEntriesInRange(x, startDate, endDate) {
	return (await x.selectFrom("task_plan_entries").selectAll().where("plan_date", ">=", startDate).where("plan_date", "<=", endDate).orderBy("plan_date").orderBy("id").execute()).map(fromTaskPlanEntryRow);
}
async function insertPlanEntry(x, entry) {
	await x.insertInto("task_plan_entries").values(toTaskPlanEntryValues(entry)).execute();
}
/**
* Memberships carry no revision of their own — they are guarded by the day and
* week revisions of the command that writes them — so this is a plain upsert,
* mirroring `taskPlanEntries.put`.
*/
async function putPlanEntry(x, entry) {
	const values = toTaskPlanEntryValues(entry);
	const updates = withoutKey(values, "id");
	await x.insertInto("task_plan_entries").values(values).onConflict((conflictBuilder) => conflictBuilder.column("id").doUpdateSet(updates)).execute();
}
async function deletePlanEntry(x, id) {
	await x.deleteFrom("task_plan_entries").where("id", "=", id).execute();
}
/** Replaces the `by-occurrence-sequence` bounded range scan. */
async function getEventsByOccurrence(x, occurrenceId) {
	return (await x.selectFrom("task_events").selectAll().where("occurrence_id", "=", occurrenceId).orderBy("sequence").execute()).map(fromTaskEventRow);
}
async function getEventsByOccurrences(x, occurrenceIds) {
	if (occurrenceIds.length === 0) return [];
	return (await x.selectFrom("task_events").selectAll().where("occurrence_id", "in", occurrenceIds).orderBy("sequence").execute()).map(fromTaskEventRow);
}
/** Replaces `allocateNextEventSequence`: the reverse key cursor over `taskEvents`. */
async function maxEventSequence(x) {
	const row = await x.selectFrom("task_events").select(({ fn }) => fn.max("sequence").as("value")).executeTakeFirst();
	return row?.value == null ? 0 : Number(row.value);
}
async function insertTaskEvent(x, event) {
	await x.insertInto("task_events").values(toTaskEventValues(event)).execute();
}
/** Replaces `habitDefinitions.getAll()`, which yields primary-key order. */
async function getAllHabitDefinitions(x) {
	return (await x.selectFrom("habit_definitions").selectAll().orderBy("id").execute()).map(fromHabitDefinitionRow);
}
async function getHabitDefinition(x, id) {
	const row = await x.selectFrom("habit_definitions").selectAll().where("id", "=", id).executeTakeFirst();
	return row === void 0 ? void 0 : fromHabitDefinitionRow(row);
}
async function insertHabitDefinition(x, definition) {
	await x.insertInto("habit_definitions").values(toHabitDefinitionValues(definition)).execute();
}
async function putHabitDefinition(x, definition, expected) {
	const values = withoutKey(toHabitDefinitionValues(definition), "id");
	const result = await x.updateTable("habit_definitions").set(values).where("id", "=", definition.id).where("revision", "=", expected).executeTakeFirst();
	if (Number(result.numUpdatedRows) === 0) await conflict((await getHabitDefinition(x, definition.id))?.revision, expected);
}
async function getHabitOccurrence(x, id) {
	const row = await x.selectFrom("habit_occurrences").selectAll().where("id", "=", id).executeTakeFirst();
	return row === void 0 ? void 0 : fromHabitOccurrenceRow(row);
}
/** Replaces the `by-date` index lookup, which yields primary-key order. */
async function getHabitOccurrencesByDate(x, date) {
	return (await x.selectFrom("habit_occurrences").selectAll().where("date", "=", date).orderBy("id").execute()).map(fromHabitOccurrenceRow);
}
/** Replaces the `by-date` bounded range scan. */
async function getHabitOccurrencesInRange(x, startDate, endDate) {
	return (await x.selectFrom("habit_occurrences").selectAll().where("date", ">=", startDate).where("date", "<=", endDate).orderBy("date").orderBy("id").execute()).map(fromHabitOccurrenceRow);
}
async function insertHabitOccurrence(x, occurrence) {
	await x.insertInto("habit_occurrences").values(toHabitOccurrenceValues(occurrence)).execute();
}
/**
* Habit occurrences carry no revision of their own: 001 guards them with the
* revision of their owning day, which the same command transaction updates.
*/
async function putHabitOccurrence(x, occurrence) {
	const values = toHabitOccurrenceValues(occurrence);
	const updates = withoutKey(values, "id");
	await x.insertInto("habit_occurrences").values(values).onConflict((conflictBuilder) => conflictBuilder.column("id").doUpdateSet(updates)).execute();
}
async function deleteHabitOccurrence$1(x, id) {
	await x.deleteFrom("habit_occurrences").where("id", "=", id).execute();
}
//#endregion
//#region server/planning/history-queries.ts
/**
* Derives the query's bounds before touching the database, so an invalid
* selection is rejected without opening a transaction at all.
*/
function deriveHistoryRange(query) {
	try {
		return deriveHistoryDateRange(query);
	} catch (error) {
		if (error instanceof RangeError && query.mode === "month") throw new DomainFailure({
			code: "ValidationFailure",
			issues: [{
				field: "selectedDate",
				message: "Selected date must belong to the anchor month"
			}]
		});
		throw error;
	}
}
/**
* Every read is bounded by the derived range: the day, week, or month the
* caller asked for. The whole projection runs inside one `REPEATABLE READ`
* snapshot, so a command committing mid-query cannot produce a view that never
* existed.
*/
async function getHistoryView(trx, query, range) {
	const weekStarts = [...new Set(range.dates.map((date) => startOfWeek(date)))];
	const [days, taskPlanEntries, habitOccurrences, weeks] = await Promise.all([
		getDaysInRange(trx, range.startDate, range.endDate),
		getPlanEntriesInRange(trx, range.startDate, range.endDate),
		getHabitOccurrencesInRange(trx, range.startDate, range.endDate),
		getWeeksByStarts(trx, weekStarts)
	]);
	const occurrenceIds = [...new Set(taskPlanEntries.map((membership) => membership.occurrenceId))];
	const [taskOccurrences, taskEvents] = await Promise.all([getTaskOccurrencesByIds(trx, occurrenceIds), getEventsByOccurrences(trx, occurrenceIds)]);
	return selectHistoryView({
		query,
		weeks,
		days,
		taskOccurrences,
		taskPlanEntries,
		taskEvents,
		habitOccurrences
	});
}
//#endregion
//#region src/entities/planning/model/day-closure.ts
function periodOwnershipIsValid(period) {
	const expectedWeekStart = startOfWeek(period.day.date);
	return period.day.weekStart === expectedWeekStart && period.week.startDate === expectedWeekStart;
}
function validateSourcePeriod(period) {
	if (!periodOwnershipIsValid(period)) return {
		code: "ClosureDataInvariant",
		message: `Source period records do not own ${period.day.date}`
	};
	if (period.day.status === "closed") return {
		code: "PeriodImmutable",
		date: period.day.date
	};
	if (period.week.status === "completed") return {
		code: "PeriodImmutable",
		weekStart: period.week.startDate
	};
}
function destinationPeriod(periods, destinationDate) {
	return periods.find((period) => period.day.date === destinationDate);
}
function validateDestination(occurrenceId, sourceDate, disposition, periods) {
	if (disposition.destinationDate === sourceDate) return {
		code: "InvalidClosureDestination",
		occurrenceId,
		destinationDate: disposition.destinationDate,
		reason: "same-date"
	};
	if (!isDurationMinutes(disposition.durationMinutes)) return {
		code: "InvalidClosureDestination",
		occurrenceId,
		destinationDate: disposition.destinationDate,
		reason: "non-positive-duration"
	};
	if (!isDayPosition(disposition.dayPosition)) return {
		code: "InvalidClosureDestination",
		occurrenceId,
		destinationDate: disposition.destinationDate,
		reason: "invalid-day-position"
	};
	const period = destinationPeriod(periods, disposition.destinationDate);
	if (period === void 0 || !periodOwnershipIsValid(period) || period.day.status !== "open" || period.week.status !== "open") return {
		code: "MoveTargetClosed",
		destinationDate: disposition.destinationDate
	};
}
function naturalMemberships(entries, occurrenceId, date) {
	return entries.filter((entry) => entry.occurrenceId === occurrenceId && entry.date === date);
}
function sourceMembershipBase(entry, finalizedAt) {
	return {
		id: entry.id,
		occurrenceId: entry.occurrenceId,
		date: entry.date,
		weekStart: entry.weekStart,
		plannedSnapshot: entry.plannedSnapshot,
		enteredAt: entry.enteredAt,
		finalizedAt
	};
}
function occurrenceCommon(occurrence) {
	return {
		id: occurrence.id,
		...occurrence.seriesId === void 0 ? {} : { seriesId: occurrence.seriesId },
		...occurrence.nominalDate === void 0 ? {} : { nominalDate: occurrence.nominalDate },
		...occurrence.ruleRevision === void 0 ? {} : { ruleRevision: occurrence.ruleRevision },
		title: occurrence.title,
		...occurrence.notes === void 0 ? {} : { notes: occurrence.notes },
		isException: occurrence.isException,
		createdSequence: occurrence.createdSequence,
		revision: nextRevision(occurrence.revision)
	};
}
function finalizeOccurrence(occurrence) {
	return {
		...occurrenceCommon(occurrence),
		state: "finalized",
		placement: { kind: "none" },
		plannedDurationMinutes: occurrence.plannedDurationMinutes
	};
}
function moveOccurrenceToBacklog(occurrence) {
	return {
		...occurrenceCommon(occurrence),
		state: "active",
		placement: { kind: "backlog" },
		plannedDurationMinutes: occurrence.plannedDurationMinutes
	};
}
function moveOccurrenceToDate(occurrence, disposition) {
	return {
		...occurrenceCommon(occurrence),
		state: "active",
		placement: {
			kind: "day",
			date: disposition.destinationDate
		},
		plannedDurationMinutes: disposition.durationMinutes,
		dayPosition: disposition.dayPosition,
		completion: "incomplete"
	};
}
function eventBase(occurrence, planEntryId, sourceDate, occurredAt) {
	return {
		occurrenceId: occurrence.id,
		...occurrence.seriesId === void 0 ? {} : { seriesId: occurrence.seriesId },
		planEntryId,
		effectiveDate: sourceDate,
		occurredAt
	};
}
function taskCounts(entries) {
	return {
		completed: entries.reduce((completed, entry) => completed + (entry.outcome === "completed" ? 1 : 0), 0),
		applicable: entries.length
	};
}
function habitCounts(occurrences, date) {
	return occurrences.reduce((counts, occurrence) => occurrence.date !== date || !isHabitOccurrenceApplicable(occurrence) ? counts : {
		completed: counts.completed + (occurrence.outcome === "completed" ? 1 : 0),
		applicable: counts.applicable + 1
	}, {
		completed: 0,
		applicable: 0
	});
}
function uniqueSortedDates(dates) {
	return [...new Set(dates)].toSorted(compareLocalDates);
}
function prepareDestinationMembership(input, occurrence, disposition, occurredAt) {
	const matching = naturalMemberships(input.taskPlanEntries, occurrence.id, disposition.destinationDate);
	if (matching.length > 1) return err({
		code: "ClosureDataInvariant",
		message: `Duplicate membership for ${occurrence.id} on ${disposition.destinationDate}`
	});
	const existing = matching[0];
	if (existing?.outcome === "deleted" || existing?.finalizedAt !== void 0) return err({
		code: "ClosureDataInvariant",
		message: `Destination membership for ${occurrence.id} is immutable`
	});
	const id = existing?.id ?? input.destinationPlanEntryIds[occurrence.id];
	if (id === void 0) return err({
		code: "DestinationPlanEntryIdRequired",
		occurrenceId: occurrence.id
	});
	return ok({
		id,
		occurrenceId: occurrence.id,
		date: disposition.destinationDate,
		weekStart: startOfWeek(disposition.destinationDate),
		plannedSnapshot: {
			title: occurrence.title,
			...occurrence.notes === void 0 ? {} : { notes: occurrence.notes },
			plannedDurationMinutes: disposition.durationMinutes
		},
		outcome: "planned",
		enteredAt: existing?.enteredAt ?? occurredAt
	});
}
function prepareDispositionEffects(input, occurrence, sourceMembership, disposition, occurredAt) {
	const sourceDate = input.sourcePeriod.day.date;
	const base = sourceMembershipBase(sourceMembership, occurredAt);
	const audit = eventBase(occurrence, sourceMembership.id, sourceDate, occurredAt);
	if (disposition.kind === "keep-unfinished") return ok({
		occurrence: finalizeOccurrence(occurrence),
		sourceMembership: {
			...base,
			outcome: "kept-unfinished"
		},
		event: {
			...audit,
			type: "closure-keep",
			payload: { date: sourceDate }
		}
	});
	if (disposition.kind === "move-to-date") {
		const destination = prepareDestinationMembership(input, occurrence, disposition, occurredAt);
		if (!destination.ok) return destination;
		return ok({
			occurrence: moveOccurrenceToDate(occurrence, disposition),
			sourceMembership: {
				...base,
				outcome: "moved",
				destination: {
					kind: "day",
					date: disposition.destinationDate
				}
			},
			destinationMembership: destination.value,
			event: {
				...audit,
				type: "closure-move",
				payload: {
					fromDate: sourceDate,
					destination: {
						kind: "day",
						date: disposition.destinationDate
					}
				}
			},
			affectedDestinationDate: disposition.destinationDate
		});
	}
	if (disposition.kind === "move-to-backlog") return ok({
		occurrence: moveOccurrenceToBacklog(occurrence),
		sourceMembership: {
			...base,
			outcome: "backlogged",
			destination: { kind: "backlog" }
		},
		event: {
			...audit,
			type: "closure-move",
			payload: {
				fromDate: sourceDate,
				destination: { kind: "backlog" }
			}
		}
	});
	return ok({
		occurrence: finalizeOccurrence(occurrence),
		sourceMembership: {
			...base,
			outcome: "canceled"
		},
		event: {
			...audit,
			type: "closure-cancel",
			payload: { date: sourceDate }
		}
	});
}
function matchingSourceMembership(input, occurrence, sourceDate) {
	const matching = naturalMemberships(input.taskPlanEntries, occurrence.id, sourceDate);
	if (matching.length !== 1 || matching[0] === void 0) return err({
		code: "ClosureDataInvariant",
		message: `Expected one source membership for ${occurrence.id} on ${sourceDate}`
	});
	if (matching[0].outcome === "deleted") return err({
		code: "ClosureDataInvariant",
		message: `Current occurrence ${occurrence.id} has a deleted source membership`
	});
	return ok(matching[0]);
}
function validateAllDispositions(input, unfinished) {
	const sourceDate = input.sourcePeriod.day.date;
	const validated = [];
	for (const record of unfinished) {
		const disposition = input.dispositions[record.occurrence.id];
		if (disposition === void 0) return err({
			code: "InvalidClosureDisposition",
			occurrenceId: record.occurrence.id
		});
		if (disposition.kind === "move-to-date") {
			const destinationError = validateDestination(record.occurrence.id, sourceDate, disposition, input.destinationPeriods);
			if (destinationError !== void 0) return err(destinationError);
		}
		validated.push({
			...record,
			disposition
		});
	}
	return ok(validated);
}
/**
* Validates and prepares every closure write without mutating source records.
* The adapter must commit the returned effects in one transaction or commit none.
*/
function prepareDayClosure(input) {
	const sourceError = validateSourcePeriod(input.sourcePeriod);
	if (sourceError !== void 0) return err(sourceError);
	const sourceDate = input.sourcePeriod.day.date;
	const currentLocalDate = input.clock.currentLocalDate();
	if (compareLocalDates(sourceDate, currentLocalDate) > 0) return err({
		code: "FutureDayClosure",
		date: sourceDate,
		currentLocalDate
	});
	const pendingHabitIds = input.habitOccurrences.filter((occurrence) => occurrence.date === sourceDate && isHabitOccurrenceApplicable(occurrence) && occurrence.outcome === "pending").map((occurrence) => occurrence.id).toSorted();
	if (pendingHabitIds.length > 0) return err({
		code: "PendingHabitOutcomes",
		occurrenceIds: pendingHabitIds
	});
	const currentSourceOccurrences = input.taskOccurrences.filter((occurrence) => isDatedTaskOccurrence(occurrence) && occurrence.placement.date === sourceDate);
	if (new Set(currentSourceOccurrences.map((occurrence) => occurrence.id)).size !== currentSourceOccurrences.length) return err({
		code: "ClosureDataInvariant",
		message: "Duplicate current task occurrence ID"
	});
	const currentRecords = [];
	for (const occurrence of currentSourceOccurrences) {
		const membership = matchingSourceMembership(input, occurrence, sourceDate);
		if (!membership.ok) return membership;
		currentRecords.push({
			occurrence,
			sourceMembership: membership.value
		});
	}
	const unfinished = currentRecords.filter((record) => record.occurrence.completion === "incomplete");
	const expectedOccurrenceIds = unfinished.map((record) => record.occurrence.id).toSorted();
	const receivedOccurrenceIds = Object.keys(input.dispositions).toSorted();
	if (expectedOccurrenceIds.length !== receivedOccurrenceIds.length || expectedOccurrenceIds.some((id, index) => id !== receivedOccurrenceIds[index])) return err({
		code: "ClosureDispositionMismatch",
		expectedOccurrenceIds,
		receivedOccurrenceIds
	});
	const validatedDispositions = validateAllDispositions(input, unfinished);
	if (!validatedDispositions.ok) return validatedDispositions;
	const sourceEntries = input.taskPlanEntries.filter((entry) => entry.date === sourceDate);
	if (new Set(sourceEntries.map((entry) => `${entry.occurrenceId}|${entry.date}`)).size !== sourceEntries.length) return err({
		code: "ClosureDataInvariant",
		message: "Duplicate source task membership"
	});
	const occurredAt = input.clock.now();
	const changedOccurrences = [];
	const dispositionEntries = /* @__PURE__ */ new Map();
	const destinationEntries = [];
	const events = [];
	const affectedDestinationDates = [];
	for (const record of validatedDispositions.value) {
		const prepared = prepareDispositionEffects(input, record.occurrence, record.sourceMembership, record.disposition, occurredAt);
		if (!prepared.ok) return prepared;
		changedOccurrences.push(prepared.value.occurrence);
		dispositionEntries.set(record.occurrence.id, prepared.value.sourceMembership);
		if (prepared.value.destinationMembership !== void 0) destinationEntries.push(prepared.value.destinationMembership);
		if (prepared.value.affectedDestinationDate !== void 0) affectedDestinationDates.push(prepared.value.affectedDestinationDate);
		events.push(prepared.value.event);
	}
	for (const record of currentRecords) if (record.occurrence.completion === "completed") changedOccurrences.push(finalizeOccurrence(record.occurrence));
	const finalizedSourceEntries = sourceEntries.flatMap((entry) => {
		if (entry.outcome === "deleted") return [];
		const dispositionEntry = dispositionEntries.get(entry.occurrenceId);
		if (dispositionEntry !== void 0) return [dispositionEntry];
		if (currentSourceOccurrences.find((occurrence) => occurrence.id === entry.occurrenceId)?.completion === "completed") return [{
			...sourceMembershipBase(entry, occurredAt),
			outcome: "completed"
		}];
		return [{
			...entry,
			finalizedAt: occurredAt
		}];
	});
	const score = calculateCompletionScore({
		task: taskCounts(finalizedSourceEntries),
		habit: habitCounts(input.habitOccurrences, sourceDate)
	});
	const plannedLoadMinutes = calculatePlannedLoad(input.taskOccurrences, sourceDate);
	const day = {
		...input.sourcePeriod.day,
		status: "closed",
		closureSnapshot: {
			score,
			plannedLoadMinutes
		},
		closedAt: occurredAt,
		revision: nextRevision(input.sourcePeriod.day.revision)
	};
	const affectedDates = uniqueSortedDates([sourceDate, ...affectedDestinationDates]);
	return ok({
		effects: {
			day,
			taskOccurrences: changedOccurrences,
			taskPlanEntries: [...finalizedSourceEntries, ...destinationEntries],
			taskEvents: events
		},
		affectedDates,
		affectedWeeks: uniqueSortedDates(affectedDates.map(startOfWeek))
	});
}
//#endregion
//#region server/planning/audit.ts
/**
* Allocated inside the command transaction, exactly as feature 001 allocated
* it from the tail of the `by-created-sequence` index. Backlog order depends on
* it (001 FR-010), and the suites assert the concrete values, so it stays
* gap-free rather than coming from a PostgreSQL sequence that would advance on
* rollback.
*/
async function allocateNextCreationSequence(trx) {
	const highest = await maxCreatedSequence(trx);
	return highest === 0 ? creationSequence(1) : nextCreationSequence(creationSequence(highest));
}
/**
* The audit ordering authority. It is derived from stored rows rather than
* from the clock, so a client device clock that moves backwards can never
* reorder history.
*/
async function allocateNextEventSequence(trx) {
	const highest = await maxEventSequence(trx);
	return highest === 0 ? eventSequence(1) : nextEventSequence(eventSequence(highest));
}
function taskValueSnapshot(occurrence) {
	return {
		title: occurrence.title,
		...occurrence.notes === void 0 ? {} : { notes: occurrence.notes },
		...occurrence.plannedDurationMinutes === void 0 ? {} : { plannedDurationMinutes: occurrence.plannedDurationMinutes },
		...occurrence.startTime === void 0 ? {} : { startTime: occurrence.startTime },
		...occurrence.endTime === void 0 ? {} : { endTime: occurrence.endTime }
	};
}
function isPositiveDuration(value) {
	return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}
function isDayPositionValue(value) {
	return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
//#endregion
//#region src/entities/planning/model/recurrence.ts
function validateRecurringTaskTemplate(template) {
	if (!isDurationMinutes(template.plannedDurationMinutes)) return err([{
		code: "InvalidDuration",
		field: "plannedDurationMinutes"
	}]);
	if (!validateTaskTimeRange(template.startTime, template.endTime).ok) return err([{
		code: "InvalidTimeRange",
		field: "endTime"
	}]);
	return ok(template);
}
function isIsoWeekday(value) {
	return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 7;
}
function validateRecurrenceRule(rule) {
	const errors = [];
	if (!isLocalDate(rule.startDate)) errors.push({
		code: "InvalidStartDate",
		field: "startDate"
	});
	if (rule.endDate !== void 0 && !isLocalDate(rule.endDate)) errors.push({
		code: "InvalidEndDate",
		field: "endDate"
	});
	if (rule.weekdays.length === 0) errors.push({
		code: "WeekdaysRequired",
		field: "weekdays"
	});
	const seenWeekdays = /* @__PURE__ */ new Set();
	for (const weekday of rule.weekdays) {
		if (!isIsoWeekday(weekday)) {
			errors.push({
				code: "InvalidWeekday",
				field: "weekdays",
				value: weekday
			});
			continue;
		}
		if (seenWeekdays.has(weekday)) errors.push({
			code: "DuplicateWeekday",
			field: "weekdays",
			value: weekday
		});
		seenWeekdays.add(weekday);
	}
	if (isLocalDate(rule.startDate) && rule.endDate !== void 0 && isLocalDate(rule.endDate) && compareLocalDates(rule.endDate, rule.startDate) < 0) errors.push({
		code: "InvalidDateRange",
		field: "endDate"
	});
	if (errors.length > 0) return err(errors);
	return ok({
		startDate: rule.startDate,
		weekdays: [...seenWeekdays].sort((left, right) => left - right),
		...rule.endDate === void 0 ? {} : { endDate: rule.endDate }
	});
}
/** End dates are inclusive. Invalid runtime values simply do not apply. */
function isRecurrenceDateApplicable(rule, date) {
	if (!isLocalDate(date) || !validateRecurrenceRule(rule).ok) return false;
	if (compareLocalDates(date, rule.startDate) < 0) return false;
	if (rule.endDate !== void 0 && compareLocalDates(date, rule.endDate) > 0) return false;
	return rule.weekdays.includes(isoWeekday(date));
}
function effectiveRecurrenceVersionOn(versions, date) {
	let selected;
	for (const version of versions) {
		const hasStarted = compareLocalDates(version.effectiveFrom, date) <= 0;
		const hasNotEnded = version.effectiveThrough === void 0 || compareLocalDates(date, version.effectiveThrough) <= 0;
		if (hasStarted && hasNotEnded && (selected === void 0 || compareLocalDates(version.effectiveFrom, selected.effectiveFrom) > 0)) selected = version;
	}
	return selected;
}
function createInitialRecurrenceVersion(rule, revision) {
	const validation = validateRecurrenceRule(rule);
	if (!validation.ok) return validation;
	return ok({
		revision,
		effectiveFrom: validation.value.startDate,
		state: "active",
		rule: validation.value
	});
}
function prepareVersionsForNextDate(versions, currentLocalDate) {
	const boundary = addDays(currentLocalDate, 1);
	const retained = versions.filter((version) => compareLocalDates(version.effectiveFrom, boundary) < 0).sort((left, right) => compareLocalDates(left.effectiveFrom, right.effectiveFrom));
	const last = retained.at(-1);
	if (last !== void 0 && (last.effectiveThrough === void 0 || compareLocalDates(last.effectiveThrough, currentLocalDate) > 0)) retained[retained.length - 1] = {
		...last,
		effectiveThrough: currentLocalDate
	};
	return retained;
}
function applyRecurrenceRuleChange(input) {
	const validation = validateRecurrenceRule(input.nextRule);
	if (!validation.ok) return validation;
	const versions = prepareVersionsForNextDate(input.ruleVersions, input.currentLocalDate);
	versions.push({
		revision: input.revision,
		effectiveFrom: addDays(input.currentLocalDate, 1),
		state: "active",
		rule: validation.value
	});
	return ok(versions);
}
function stopRecurrence(input) {
	const versions = prepareVersionsForNextDate(input.ruleVersions, input.currentLocalDate);
	versions.push({
		revision: input.revision,
		effectiveFrom: addDays(input.currentLocalDate, 1),
		state: "stopped"
	});
	return versions;
}
function shouldPreserveOccurrenceForRuleChange(occurrence) {
	return compareLocalDates(occurrence.occurrenceDate, occurrence.currentLocalDate) <= 0 || occurrence.isException || occurrence.isUserDeleted;
}
//#endregion
//#region src/entities/planning/model/occurrence-materialization.ts
function taskOccurrenceNaturalKey(seriesId, date) {
	return `${seriesId}|${date}`;
}
function habitOccurrenceNaturalKey(definitionId, date) {
	return `${definitionId}|${date}`;
}
function uniqueOrderedDates(dates) {
	return [...new Set(dates)].sort(compareLocalDates);
}
function taskOccurrenceKey(occurrence) {
	return occurrence.seriesId === void 0 || occurrence.nominalDate === void 0 ? void 0 : taskOccurrenceNaturalKey(occurrence.seriesId, occurrence.nominalDate);
}
function isActiveDatedTaskOccurrence(occurrence) {
	return occurrence.state === "active" && occurrence.placement.kind === "day" && "completion" in occurrence;
}
function untouchedFutureTaskMembership(occurrence, memberships, touchedOccurrenceIds, currentLocalDate) {
	if (occurrence.nominalDate === void 0 || shouldPreserveOccurrenceForRuleChange({
		occurrenceDate: occurrence.nominalDate,
		currentLocalDate,
		isException: occurrence.isException,
		isUserDeleted: occurrence.state === "deleted"
	}) || !isActiveDatedTaskOccurrence(occurrence) || occurrence.placement.date !== occurrence.nominalDate || occurrence.completion !== "incomplete" || touchedOccurrenceIds.has(occurrence.id)) return;
	return memberships.find((membership) => membership.occurrenceId === occurrence.id && membership.date === occurrence.nominalDate && membership.outcome === "planned" && membership.finalizedAt === void 0);
}
function createTaskEffect(series, date, ruleRevision, position) {
	const plannedSnapshot = {
		title: series.template.title,
		...series.template.notes === void 0 ? {} : { notes: series.template.notes },
		plannedDurationMinutes: series.template.plannedDurationMinutes,
		...series.template.startTime === void 0 ? {} : { startTime: series.template.startTime },
		...series.template.endTime === void 0 ? {} : { endTime: series.template.endTime }
	};
	return {
		naturalKey: taskOccurrenceNaturalKey(series.id, date),
		seriesId: series.id,
		nominalDate: date,
		ruleRevision,
		title: series.template.title,
		...series.template.notes === void 0 ? {} : { notes: series.template.notes },
		plannedDurationMinutes: series.template.plannedDurationMinutes,
		...series.template.startTime === void 0 ? {} : { startTime: series.template.startTime },
		...series.template.endTime === void 0 ? {} : { endTime: series.template.endTime },
		placement: {
			kind: "day",
			date
		},
		dayPosition: position,
		completion: "incomplete",
		isException: false,
		membership: {
			date,
			weekStart: startOfWeek(date),
			plannedSnapshot,
			outcome: "planned"
		}
	};
}
function createHabitEffect(definition, date, ruleRevision) {
	return {
		naturalKey: habitOccurrenceNaturalKey(definition.id, date),
		definitionId: definition.id,
		date,
		weekStart: startOfWeek(date),
		ruleRevision,
		definitionSnapshot: { title: definition.title },
		isException: false,
		outcome: "pending",
		outcomeEvents: []
	};
}
function planOccurrenceMaterialization(input) {
	const openDates = uniqueOrderedDates(input.openDates);
	const openDateSet = new Set(openDates);
	const nextTaskPositionByDate = new Map(openDates.map((date) => [date, 0]));
	for (const occurrence of input.taskOccurrences) {
		if (!isActiveDatedTaskOccurrence(occurrence) || !openDateSet.has(occurrence.placement.date)) continue;
		const position = occurrence.dayPosition;
		if (position === void 0) continue;
		const nextPosition = nextTaskPositionByDate.get(occurrence.placement.date) ?? 0;
		nextTaskPositionByDate.set(occurrence.placement.date, Math.max(nextPosition, position + 1));
	}
	const existingTaskKeys = new Set(input.taskOccurrences.map(taskOccurrenceKey).filter((key) => key !== void 0));
	const existingHabitKeys = new Set(input.habitOccurrences.map((occurrence) => habitOccurrenceNaturalKey(occurrence.definitionId, occurrence.date)));
	const touchedOccurrenceIds = new Set(input.taskEvents.map((event) => event.occurrenceId));
	const seriesById = new Map(input.taskSeries.map((series) => [series.id, series]));
	const definitionById = new Map(input.habitDefinitions.map((definition) => [definition.id, definition]));
	const createTaskBundles = [];
	for (const series of input.taskSeries) {
		if (!validateRecurringTaskTemplate(series.template).ok) continue;
		for (const date of openDates) {
			const version = effectiveRecurrenceVersionOn(series.ruleVersions, date);
			const key = taskOccurrenceNaturalKey(series.id, date);
			if (version?.state === "active" && isRecurrenceDateApplicable(version.rule, date) && !existingTaskKeys.has(key)) {
				const nextPosition = nextTaskPositionByDate.get(date) ?? 0;
				createTaskBundles.push(createTaskEffect(series, date, version.revision, dayPosition(nextPosition)));
				nextTaskPositionByDate.set(date, nextPosition + 1);
				existingTaskKeys.add(key);
			}
		}
	}
	const createHabitOccurrences = [];
	for (const definition of input.habitDefinitions) for (const date of openDates) {
		const version = effectiveRecurrenceVersionOn(definition.ruleVersions, date);
		const key = habitOccurrenceNaturalKey(definition.id, date);
		if (version?.state === "active" && isRecurrenceDateApplicable(version.rule, date) && !existingHabitKeys.has(key)) {
			createHabitOccurrences.push(createHabitEffect(definition, date, version.revision));
			existingHabitKeys.add(key);
		}
	}
	const removeTaskBundles = [];
	for (const occurrence of input.taskOccurrences) {
		if (occurrence.seriesId === void 0 || occurrence.nominalDate === void 0 || !openDateSet.has(occurrence.nominalDate)) continue;
		const series = seriesById.get(occurrence.seriesId);
		if (series === void 0) continue;
		const version = effectiveRecurrenceVersionOn(series.ruleVersions, occurrence.nominalDate);
		if (version?.state === "active" && isRecurrenceDateApplicable(version.rule, occurrence.nominalDate)) continue;
		const membership = untouchedFutureTaskMembership(occurrence, input.taskPlanEntries, touchedOccurrenceIds, input.currentLocalDate);
		if (membership !== void 0) removeTaskBundles.push({
			occurrenceId: occurrence.id,
			planEntryId: membership.id
		});
	}
	const removeHabitOccurrences = [];
	for (const occurrence of input.habitOccurrences) {
		if (!openDateSet.has(occurrence.date)) continue;
		const definition = definitionById.get(occurrence.definitionId);
		if (definition === void 0) continue;
		const version = effectiveRecurrenceVersionOn(definition.ruleVersions, occurrence.date);
		if (!(version?.state === "active" && isRecurrenceDateApplicable(version.rule, occurrence.date)) && !shouldPreserveOccurrenceForRuleChange({
			occurrenceDate: occurrence.date,
			currentLocalDate: input.currentLocalDate,
			isException: occurrence.isException,
			isUserDeleted: occurrence.outcome === "deleted"
		}) && occurrence.outcome === "pending" && occurrence.outcomeEvents.length === 0) removeHabitOccurrences.push({ occurrenceId: occurrence.id });
	}
	return {
		createTaskBundles,
		removeTaskBundles,
		createHabitOccurrences,
		removeHabitOccurrences,
		taskEvents: []
	};
}
//#endregion
//#region server/planning/materialization.ts
/** The page-derived bounds; callers cannot supply an arbitrary window. */
function datesForOpenPeriod(range) {
	switch (range.kind) {
		case "day": return [range.date];
		case "week": return weekDates(startOfWeek(range.weekStart));
		case "month": {
			const { year, month } = getLocalDateParts(range.anchorDate);
			const dates = [];
			for (let day = 1; day <= 31; day += 1) try {
				dates.push(localDateFromParts(year, month, day));
			} catch {
				break;
			}
			return dates;
		}
	}
}
/**
* Collects everything the pure materialization planner needs for a set of open
* dates. Every read is bounded by those dates: nothing scans a dated table
* without a date predicate, which is what keeps a 52-week history from being
* loaded to prepare one day.
*/
async function readMaterializationInputs(trx, openDates) {
	const taskSeries = await getAllTaskSeries(trx);
	const habitDefinitions = await getAllHabitDefinitions(trx);
	const taskOccurrences = /* @__PURE__ */ new Map();
	const taskPlanEntries = /* @__PURE__ */ new Map();
	const habitOccurrences = /* @__PURE__ */ new Map();
	for (const date of openDates) {
		for (const entry of await getPlanEntriesByDate(trx, date)) taskPlanEntries.set(entry.id, entry);
		for (const occurrence of await getHabitOccurrencesByDate(trx, date)) habitOccurrences.set(occurrence.id, occurrence);
		for (const occurrence of await getTaskOccurrencesPlacedOn(trx, date)) taskOccurrences.set(occurrence.id, occurrence);
		for (const series of taskSeries) {
			const generated = await getTaskOccurrenceBySeriesDate(trx, series.id, date);
			if (generated !== void 0) taskOccurrences.set(generated.id, generated);
		}
	}
	const taskEvents = /* @__PURE__ */ new Map();
	for (const event of await getEventsByOccurrences(trx, [...taskOccurrences.keys()])) taskEvents.set(event.id, event);
	return {
		taskSeries,
		habitDefinitions,
		taskOccurrences,
		taskPlanEntries,
		habitOccurrences,
		taskEvents
	};
}
async function prepareOpenPeriod(ctx, trx, range) {
	const requestedDates = datesForOpenPeriod(range);
	const openDays = /* @__PURE__ */ new Map();
	for (const date of requestedDates) {
		const day = await getDay(trx, date);
		if (day?.status !== "open") continue;
		if ((await getWeek(trx, day.weekStart))?.status !== "open") continue;
		openDays.set(date, day);
	}
	const openDates = [...openDays.keys()];
	if (openDates.length === 0) return {
		value: void 0,
		affectedDates: [],
		affectedWeeks: []
	};
	const inputs = await readMaterializationInputs(trx, openDates);
	const effects = planOccurrenceMaterialization({
		openDates,
		currentLocalDate: ctx.clock.currentLocalDate(),
		taskSeries: inputs.taskSeries,
		habitDefinitions: inputs.habitDefinitions,
		taskOccurrences: [...inputs.taskOccurrences.values()],
		taskPlanEntries: [...inputs.taskPlanEntries.values()],
		taskEvents: [...inputs.taskEvents.values()],
		habitOccurrences: [...inputs.habitOccurrences.values()]
	});
	const changedDates = /* @__PURE__ */ new Set();
	const now = ctx.clock.now();
	for (const effect of effects.removeTaskBundles) {
		const occurrence = inputs.taskOccurrences.get(effect.occurrenceId);
		if (occurrence?.nominalDate !== void 0) changedDates.add(occurrence.nominalDate);
		await deletePlanEntry(trx, effect.planEntryId);
		await deleteTaskOccurrence$1(trx, effect.occurrenceId);
		inputs.taskOccurrences.delete(effect.occurrenceId);
	}
	for (const effect of effects.removeHabitOccurrences) {
		const occurrence = inputs.habitOccurrences.get(effect.occurrenceId);
		if (occurrence !== void 0) changedDates.add(occurrence.date);
		await deleteHabitOccurrence$1(trx, effect.occurrenceId);
		inputs.habitOccurrences.delete(effect.occurrenceId);
	}
	let nextCreatedSequence = effects.createTaskBundles.length === 0 ? void 0 : await allocateNextCreationSequence(trx);
	for (const [effectIndex, effect] of effects.createTaskBundles.entries()) {
		if (nextCreatedSequence === void 0) throw new Error("Creation sequence was not allocated");
		const occurrenceId = ctx.nextId();
		const entryId = ctx.nextId();
		const occurrence = {
			id: occurrenceId,
			seriesId: effect.seriesId,
			nominalDate: effect.nominalDate,
			ruleRevision: effect.ruleRevision,
			title: effect.title,
			...effect.notes === void 0 ? {} : { notes: effect.notes },
			...effect.startTime === void 0 ? {} : { startTime: effect.startTime },
			...effect.endTime === void 0 ? {} : { endTime: effect.endTime },
			plannedDurationMinutes: effect.plannedDurationMinutes,
			isException: false,
			createdSequence: nextCreatedSequence,
			revision: revision(0),
			state: "active",
			placement: effect.placement,
			dayPosition: effect.dayPosition,
			completion: "incomplete"
		};
		const entry = {
			id: entryId,
			occurrenceId,
			date: effect.membership.date,
			weekStart: effect.membership.weekStart,
			plannedSnapshot: effect.membership.plannedSnapshot,
			enteredAt: now,
			outcome: "planned"
		};
		await insertTaskOccurrence(trx, occurrence);
		await insertPlanEntry(trx, entry);
		inputs.taskOccurrences.set(occurrence.id, occurrence);
		inputs.taskPlanEntries.set(entry.id, entry);
		changedDates.add(effect.nominalDate);
		if (effectIndex < effects.createTaskBundles.length - 1) nextCreatedSequence = nextCreationSequence(nextCreatedSequence);
	}
	for (const effect of effects.createHabitOccurrences) {
		const occurrence = {
			id: ctx.nextId(),
			definitionId: effect.definitionId,
			date: effect.date,
			weekStart: effect.weekStart,
			definitionSnapshot: effect.definitionSnapshot,
			ruleRevision: effect.ruleRevision,
			isException: false,
			outcome: "pending",
			outcomeEvents: [],
			updatedAt: now
		};
		await insertHabitOccurrence(trx, occurrence);
		inputs.habitOccurrences.set(occurrence.id, occurrence);
		changedDates.add(effect.date);
	}
	for (const occurrence of inputs.habitOccurrences.values()) {
		const day = openDays.get(occurrence.date);
		if (day === void 0) continue;
		const transition = catchUpHabitDateBoundary({
			occurrence,
			dayStatus: day.status,
			clock: ctx.clock
		});
		if (!transition.ok) throw habitTransitionFailure(transition.error);
		if (transition.value.changed) {
			await putHabitOccurrence(trx, transition.value.occurrence);
			changedDates.add(occurrence.date);
		}
	}
	const affectedWeeks = /* @__PURE__ */ new Map();
	for (const date of changedDates) {
		const day = openDays.get(date);
		if (day === void 0) continue;
		await putDay(trx, {
			...day,
			revision: nextRevision(day.revision)
		}, day.revision);
		const week = await getWeek(trx, day.weekStart);
		if (week?.status === "open") affectedWeeks.set(week.startDate, week);
	}
	for (const week of affectedWeeks.values()) await putWeek(trx, {
		...week,
		revision: nextRevision(week.revision)
	}, week.revision);
	return {
		value: void 0,
		affectedDates: [...changedDates].sort(),
		affectedWeeks: [...affectedWeeks.keys()].sort()
	};
}
/**
* Reruns bounded materialization for the single date being closed, so a day
* cannot be closed before its recurring rows exist and its habit boundary
* misses have been recorded (001 FR-039, FR-020). It deliberately does not bump
* revisions: `closeDay` owns the aggregate write that follows.
*/
async function prepareClosureDate(ctx, trx, date) {
	const day = await getDay(trx, date);
	if (day?.status !== "open") return;
	if ((await getWeek(trx, day.weekStart))?.status !== "open") return;
	const inputs = await readMaterializationInputs(trx, [date]);
	const effects = planOccurrenceMaterialization({
		openDates: [date],
		currentLocalDate: ctx.clock.currentLocalDate(),
		taskSeries: inputs.taskSeries,
		habitDefinitions: inputs.habitDefinitions,
		taskOccurrences: [...inputs.taskOccurrences.values()],
		taskPlanEntries: [...inputs.taskPlanEntries.values()],
		taskEvents: [...inputs.taskEvents.values()],
		habitOccurrences: [...inputs.habitOccurrences.values()]
	});
	for (const effect of effects.removeTaskBundles) {
		await deletePlanEntry(trx, effect.planEntryId);
		await deleteTaskOccurrence$1(trx, effect.occurrenceId);
	}
	for (const effect of effects.removeHabitOccurrences) await deleteHabitOccurrence$1(trx, effect.occurrenceId);
	const now = ctx.clock.now();
	let nextCreatedSequence = effects.createTaskBundles.length === 0 ? void 0 : await allocateNextCreationSequence(trx);
	for (const [effectIndex, effect] of effects.createTaskBundles.entries()) {
		if (nextCreatedSequence === void 0) throw new Error("Creation sequence was not allocated");
		const occurrenceId = ctx.nextId();
		const occurrence = {
			id: occurrenceId,
			seriesId: effect.seriesId,
			nominalDate: effect.nominalDate,
			ruleRevision: effect.ruleRevision,
			title: effect.title,
			...effect.notes === void 0 ? {} : { notes: effect.notes },
			...effect.startTime === void 0 ? {} : { startTime: effect.startTime },
			...effect.endTime === void 0 ? {} : { endTime: effect.endTime },
			plannedDurationMinutes: effect.plannedDurationMinutes,
			isException: false,
			createdSequence: nextCreatedSequence,
			revision: revision(0),
			state: "active",
			placement: effect.placement,
			dayPosition: effect.dayPosition,
			completion: "incomplete"
		};
		const entry = {
			id: ctx.nextId(),
			occurrenceId,
			date: effect.membership.date,
			weekStart: effect.membership.weekStart,
			plannedSnapshot: effect.membership.plannedSnapshot,
			enteredAt: now,
			outcome: "planned"
		};
		await insertTaskOccurrence(trx, occurrence);
		await insertPlanEntry(trx, entry);
		if (effectIndex < effects.createTaskBundles.length - 1) nextCreatedSequence = nextCreationSequence(nextCreatedSequence);
	}
	const preparedHabits = new Map(inputs.habitOccurrences);
	for (const effect of effects.createHabitOccurrences) {
		const occurrence = {
			id: ctx.nextId(),
			definitionId: effect.definitionId,
			date: effect.date,
			weekStart: effect.weekStart,
			definitionSnapshot: effect.definitionSnapshot,
			ruleRevision: effect.ruleRevision,
			isException: false,
			outcome: "pending",
			outcomeEvents: [],
			updatedAt: now
		};
		await insertHabitOccurrence(trx, occurrence);
		preparedHabits.set(occurrence.id, occurrence);
	}
	for (const removed of effects.removeHabitOccurrences) preparedHabits.delete(removed.occurrenceId);
	for (const occurrence of preparedHabits.values()) {
		const transition = catchUpHabitDateBoundary({
			occurrence,
			dayStatus: day.status,
			clock: ctx.clock
		});
		if (!transition.ok) throw habitTransitionFailure(transition.error);
		if (transition.value.changed) await putHabitOccurrence(trx, transition.value.occurrence);
	}
}
//#endregion
//#region server/planning/closure.ts
/**
* Day closure in one transaction. It touches days, occurrences, memberships,
* audit events, and habit occurrences, so it is the case that decides whether
* atomicity actually holds (002 FR-007, SC-005).
*/
async function closeDay(ctx, trx, input) {
	const sourceDay = await getDay(trx, input.date);
	if (sourceDay === void 0) throw new DomainFailure({
		code: "NotFound",
		entity: "Day",
		id: input.date
	});
	requireOpenDay(sourceDay, input.expectedDayRevision);
	const sourceWeek = await getWeek(trx, sourceDay.weekStart);
	requireOpenWeek(sourceWeek, sourceDay.weekStart);
	await prepareClosureDate(ctx, trx, input.date);
	const sourceEntries = await getPlanEntriesByDate(trx, input.date);
	const occurrenceIds = new Set(sourceEntries.map((entry) => entry.occurrenceId));
	for (const placed of await getTaskOccurrencesPlacedOn(trx, input.date)) occurrenceIds.add(placed.id);
	const taskOccurrences = [...await getTaskOccurrencesByIds(trx, [...occurrenceIds])];
	const taskPlanEntries = new Map(sourceEntries.map((entry) => [entry.id, entry]));
	const destinationPeriods = [];
	const destinationPlanEntryIds = {};
	const destinationDates = /* @__PURE__ */ new Set();
	for (const [occurrenceId, disposition] of Object.entries(input.dispositions)) {
		if (disposition.kind !== "move-to-date") continue;
		destinationDates.add(disposition.destinationDate);
		const existing = await getPlanEntryByOccurrenceDate(trx, occurrenceId, disposition.destinationDate);
		if (existing !== void 0) taskPlanEntries.set(existing.id, existing);
		else destinationPlanEntryIds[occurrenceId] = ctx.nextId();
	}
	for (const destinationDate of destinationDates) {
		const destinationDay = await getDay(trx, destinationDate);
		if (destinationDay === void 0) continue;
		const destinationWeek = await getWeek(trx, destinationDay.weekStart);
		if (destinationWeek === void 0) continue;
		destinationPeriods.push({
			day: destinationDay,
			week: destinationWeek
		});
	}
	const habitOccurrences = await getHabitOccurrencesByDate(trx, input.date);
	const prepared = prepareDayClosure({
		sourcePeriod: {
			day: sourceDay,
			week: sourceWeek
		},
		clock: ctx.clock,
		dispositions: input.dispositions,
		taskOccurrences,
		taskPlanEntries: [...taskPlanEntries.values()],
		habitOccurrences,
		destinationPeriods,
		destinationPlanEntryIds
	});
	if (!prepared.ok) throw dayClosureFailure(prepared.error);
	await putDay(trx, prepared.value.effects.day, sourceDay.revision);
	const occurrenceRevisions = new Map(taskOccurrences.map((occurrence) => [occurrence.id, occurrence.revision]));
	for (const occurrence of prepared.value.effects.taskOccurrences) {
		const expected = occurrenceRevisions.get(occurrence.id);
		if (expected === void 0) throw new Error(`Closure produced an occurrence it never read: ${occurrence.id}`);
		await putTaskOccurrence(trx, occurrence, expected);
	}
	for (const entry of prepared.value.effects.taskPlanEntries) await putPlanEntry(trx, entry);
	for (const effect of prepared.value.effects.taskEvents) {
		const sequence = await allocateNextEventSequence(trx);
		await insertTaskEvent(trx, {
			...effect,
			id: ctx.nextId(),
			sequence
		});
	}
	for (const destinationDate of destinationDates) {
		const destinationDay = await getDay(trx, destinationDate);
		if (destinationDay?.status !== "open") continue;
		await putDay(trx, {
			...destinationDay,
			revision: nextRevision(destinationDay.revision)
		}, destinationDay.revision);
	}
	const affectedWeeks = /* @__PURE__ */ new Map();
	for (const weekStart of prepared.value.affectedWeeks) {
		const week = await getWeek(trx, weekStart);
		if (week?.status === "open") affectedWeeks.set(week.startDate, week);
	}
	for (const week of affectedWeeks.values()) await putWeek(trx, {
		...week,
		revision: nextRevision(week.revision)
	}, week.revision);
	return {
		value: prepared.value.effects.day.closureSnapshot,
		affectedDates: prepared.value.affectedDates,
		affectedWeeks: [...affectedWeeks.keys()]
	};
}
//#endregion
//#region server/planning/daily-state.ts
async function saveDailyState(ctx, trx, input) {
	const day = await getDay(trx, input.date);
	if (day === void 0) throw new DomainFailure({
		code: "NotFound",
		entity: "Day",
		id: input.date
	});
	requireOpenDay(day, input.expectedDayRevision);
	const week = await getWeek(trx, day.weekStart);
	requireOpenWeek(week, day.weekStart);
	const prepared = prepareDailyStateUpdate({
		day,
		weekStatus: week.status,
		...input.energy === void 0 ? {} : { energy: input.energy },
		...input.mood === void 0 ? {} : { mood: input.mood },
		...input.sleepDurationMinutes === void 0 ? {} : { sleepDurationMinutes: input.sleepDurationMinutes },
		updatedAt: ctx.clock.now()
	});
	if (!prepared.ok) throw new DomainFailure(prepared.error);
	await putDay(trx, prepared.value, day.revision);
	await putWeek(trx, {
		...week,
		revision: nextRevision(week.revision)
	}, week.revision);
	return {
		value: void 0,
		affectedDates: [day.date],
		affectedWeeks: [week.startDate]
	};
}
//#endregion
//#region server/planning/habits.ts
async function createHabitDefinition(ctx, trx, input) {
	const title = canonicalRequiredText(input.title, "title");
	const validation = validateRecurrenceRule(input.recurrenceRule);
	if (!validation.ok) throw recurrenceValidationFailure(validation.error);
	const initialRevision = revision(0);
	const initialVersion = createInitialRecurrenceVersion(input.recurrenceRule, initialRevision);
	if (!initialVersion.ok) throw recurrenceValidationFailure(initialVersion.error);
	const definition = {
		id: ctx.nextId(),
		title,
		ruleVersions: [initialVersion.value],
		revision: initialRevision
	};
	await insertHabitDefinition(trx, definition);
	return {
		value: definition.id,
		affectedDates: [],
		affectedWeeks: []
	};
}
async function updateHabitRule(ctx, trx, input) {
	const ruleValidation = validateRecurrenceRule(input.recurrenceRule);
	if (!ruleValidation.ok) throw recurrenceValidationFailure(ruleValidation.error);
	const definition = await getHabitDefinition(trx, input.definitionId);
	if (definition === void 0) throw new DomainFailure({
		code: "NotFound",
		entity: "HabitDefinition",
		id: input.definitionId
	});
	const guard = revisionGuard(definition.revision, input.expectedRevision);
	if (guard !== void 0) throw new DomainFailure(guard);
	const updatedRevision = nextRevision(definition.revision);
	const versions = applyRecurrenceRuleChange({
		ruleVersions: definition.ruleVersions,
		currentLocalDate: ctx.clock.currentLocalDate(),
		revision: updatedRevision,
		nextRule: ruleValidation.value
	});
	if (!versions.ok) throw recurrenceValidationFailure(versions.error);
	await putHabitDefinition(trx, {
		...definition,
		ruleVersions: versions.value,
		revision: updatedRevision
	}, definition.revision);
	return {
		value: void 0,
		affectedDates: [],
		affectedWeeks: []
	};
}
async function stopHabitDefinition(ctx, trx, input) {
	const definition = await getHabitDefinition(trx, input.definitionId);
	if (definition === void 0) throw new DomainFailure({
		code: "NotFound",
		entity: "HabitDefinition",
		id: input.definitionId
	});
	const guard = revisionGuard(definition.revision, input.expectedRevision);
	if (guard !== void 0) throw new DomainFailure(guard);
	const updatedRevision = nextRevision(definition.revision);
	await putHabitDefinition(trx, {
		...definition,
		ruleVersions: stopRecurrence({
			ruleVersions: definition.ruleVersions,
			currentLocalDate: ctx.clock.currentLocalDate(),
			revision: updatedRevision
		}),
		revision: updatedRevision
	}, definition.revision);
	return {
		value: void 0,
		affectedDates: [],
		affectedWeeks: []
	};
}
/**
* A habit occurrence has no revision of its own: 001 guards it with the
* revision of its owning open day, and the same transaction bumps that day and
* its week.
*/
async function requireMutableHabitDay(trx, occurrence, expectedRevision) {
	const day = await getDay(trx, occurrence.date);
	if (day === void 0) throw new DomainFailure({
		code: "NotFound",
		entity: "Day",
		id: occurrence.date
	});
	requireOpenDay(day, expectedRevision);
	const week = await getWeek(trx, day.weekStart);
	requireOpenWeek(week, day.weekStart);
	return {
		day,
		week
	};
}
async function bumpHabitAggregates(trx, day, week) {
	await putDay(trx, {
		...day,
		revision: nextRevision(day.revision)
	}, day.revision);
	await putWeek(trx, {
		...week,
		revision: nextRevision(week.revision)
	}, week.revision);
}
async function editHabitOccurrence(ctx, trx, input) {
	const title = canonicalRequiredText(input.title, "title");
	const occurrence = await getHabitOccurrence(trx, input.occurrenceId);
	if (occurrence === void 0) throw new DomainFailure({
		code: "NotFound",
		entity: "HabitOccurrence",
		id: input.occurrenceId
	});
	const { day, week } = await requireMutableHabitDay(trx, occurrence, input.expectedRevision);
	if (occurrence.outcome === "deleted") throw new DomainFailure({
		code: "InvalidTransition",
		entity: "HabitOccurrence",
		currentState: occurrence.outcome,
		attemptedTransition: "edit"
	});
	await putHabitOccurrence(trx, {
		...occurrence,
		definitionSnapshot: { title },
		isException: true,
		updatedAt: ctx.clock.now()
	});
	await bumpHabitAggregates(trx, day, week);
	return {
		value: void 0,
		affectedDates: [day.date],
		affectedWeeks: [week.startDate]
	};
}
async function executeHabitTransition(trx, occurrenceId, expectedRevision, prepare) {
	const occurrence = await getHabitOccurrence(trx, occurrenceId);
	if (occurrence === void 0) throw new DomainFailure({
		code: "NotFound",
		entity: "HabitOccurrence",
		id: occurrenceId
	});
	const { day, week } = await requireMutableHabitDay(trx, occurrence, expectedRevision);
	const transition = prepare(occurrence, day.status);
	if (!transition.ok) throw habitTransitionFailure(transition.error);
	if (!transition.value.changed) return {
		value: void 0,
		affectedDates: [],
		affectedWeeks: []
	};
	await putHabitOccurrence(trx, transition.value.occurrence);
	await bumpHabitAggregates(trx, day, week);
	return {
		value: void 0,
		affectedDates: [day.date],
		affectedWeeks: [week.startDate]
	};
}
async function recordHabitOutcome(ctx, trx, input) {
	return executeHabitTransition(trx, input.occurrenceId, input.expectedRevision, (occurrence, dayStatus) => recordHabitOutcome$1({
		occurrence,
		dayStatus,
		clock: ctx.clock,
		outcome: input.outcome
	}));
}
async function correctBoundaryMissToCompleted(ctx, trx, input) {
	return executeHabitTransition(trx, input.occurrenceId, input.expectedRevision, (occurrence, dayStatus) => correctBoundaryMissToCompleted$1({
		occurrence,
		dayStatus,
		clock: ctx.clock
	}));
}
async function clearHabitOutcome(ctx, trx, input) {
	return executeHabitTransition(trx, input.occurrenceId, input.expectedRevision, (occurrence, dayStatus) => clearHabitOutcome$1({
		occurrence,
		dayStatus,
		clock: ctx.clock
	}));
}
async function deleteHabitOccurrence(ctx, trx, input) {
	return executeHabitTransition(trx, input.occurrenceId, input.expectedRevision, (occurrence, dayStatus) => deleteHabitOccurrence$2({
		occurrence,
		dayStatus,
		clock: ctx.clock
	}));
}
//#endregion
//#region server/planning/queries.ts
function unavailableScore() {
	return {
		task: {
			completed: 0,
			applicable: 0,
			rate: "unavailable"
		},
		habit: {
			completed: 0,
			applicable: 0,
			rate: "unavailable"
		},
		value: "unavailable",
		weightsApplied: {
			task: 0,
			habit: 0
		}
	};
}
/**
* Projects one day: its memberships, the occurrences and audit trail behind
* them, its habits, and the derived score and planned load. Ordering is the
* dated-list order 001 defines — day position first, creation order as the
* tie-break — and a membership marked deleted never appears.
*/
async function readDayFacts(trx, day) {
	const entries = await getPlanEntriesByDate(trx, day.date);
	const tasks = (await Promise.all(entries.map(async (membership) => {
		const occurrence = await getTaskOccurrence(trx, membership.occurrenceId);
		if (occurrence === void 0) return void 0;
		return {
			occurrence,
			membership,
			events: await getEventsByOccurrence(trx, membership.occurrenceId)
		};
	}))).filter((item) => item !== void 0).filter(({ occurrence, membership }) => membership.outcome !== "deleted" && (day.status === "closed" || occurrence.state === "active" && occurrence.placement.kind === "day" && occurrence.placement.date === day.date)).sort((left, right) => {
		return (left.occurrence.state === "active" && left.occurrence.placement.kind === "day" && "dayPosition" in left.occurrence ? left.occurrence.dayPosition ?? Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER) - (right.occurrence.state === "active" && right.occurrence.placement.kind === "day" && "dayPosition" in right.occurrence ? right.occurrence.dayPosition ?? Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER) || left.occurrence.createdSequence - right.occurrence.createdSequence;
	});
	const habits = await getHabitOccurrencesByDate(trx, day.date);
	const signals = selectDaySignals({
		day,
		occurrences: tasks.map(({ occurrence }) => occurrence),
		planEntries: entries,
		habits
	});
	return {
		day,
		tasks,
		habits,
		score: signals.score,
		plannedLoadMinutes: signals.plannedLoadMinutes
	};
}
async function getWeekView(trx, dateOrWeekStart) {
	const weekStart = startOfWeek(dateOrWeekStart);
	const week = await getWeek(trx, weekStart);
	if (week === void 0) throw new DomainFailure({
		code: "NotFound",
		entity: "Week",
		id: weekStart
	});
	const days = await getDaysByWeekStart(trx, weekStart);
	return {
		week,
		days: await Promise.all(days.map(async (day) => {
			const facts = await readDayFacts(trx, day);
			return {
				date: day.date,
				status: day.status,
				score: facts.score,
				plannedLoadMinutes: facts.plannedLoadMinutes
			};
		})),
		progress: week.status === "completed" ? week.completionSnapshot.progress : unavailableScore()
	};
}
async function getDayView(trx, date) {
	const day = await getDay(trx, date);
	if (day === void 0) throw new DomainFailure({
		code: "NotFound",
		entity: "Day",
		id: date
	});
	const facts = await readDayFacts(trx, day);
	return {
		...facts,
		unfinishedTaskIds: facts.tasks.filter(({ occurrence }) => occurrence.state === "active" && occurrence.placement.kind === "day" && "completion" in occurrence ? occurrence.completion === "incomplete" : false).map(({ occurrence }) => occurrence.id)
	};
}
async function getBacklogView(trx) {
	return { tasks: (await getBacklogTaskOccurrences(trx)).filter((task) => task.state === "active" && task.placement.kind === "backlog") };
}
async function getTaskHistory(trx, occurrenceId) {
	const occurrence = await getTaskOccurrence(trx, occurrenceId);
	if (occurrence === void 0) throw new DomainFailure({
		code: "NotFound",
		entity: "TaskOccurrence",
		id: occurrenceId
	});
	return {
		occurrence,
		memberships: await getPlanEntriesByOccurrence(trx, occurrenceId),
		events: await getEventsByOccurrence(trx, occurrenceId)
	};
}
//#endregion
//#region server/planning/series.ts
async function createTaskSeries(ctx, trx, input) {
	const title = canonicalRequiredText(input.template.title, "title");
	const templateValidation = validateRecurringTaskTemplate(input.template);
	if (!templateValidation.ok) throw recurrenceValidationFailure(templateValidation.error);
	const ruleValidation = validateRecurrenceRule(input.recurrenceRule);
	if (!ruleValidation.ok) throw recurrenceValidationFailure(ruleValidation.error);
	const initialRevision = revision(0);
	const initialVersion = createInitialRecurrenceVersion(input.recurrenceRule, initialRevision);
	if (!initialVersion.ok) throw recurrenceValidationFailure(initialVersion.error);
	const series = {
		id: ctx.nextId(),
		template: {
			title,
			...input.template.notes === void 0 ? {} : { notes: input.template.notes },
			plannedDurationMinutes: input.template.plannedDurationMinutes,
			...input.template.startTime === void 0 ? {} : { startTime: input.template.startTime },
			...input.template.endTime === void 0 ? {} : { endTime: input.template.endTime }
		},
		ruleVersions: [initialVersion.value],
		revision: initialRevision
	};
	await insertTaskSeries(trx, series);
	return {
		value: series.id,
		affectedDates: [],
		affectedWeeks: []
	};
}
async function updateTaskSeriesRule(ctx, trx, input) {
	const ruleValidation = validateRecurrenceRule(input.recurrenceRule);
	if (!ruleValidation.ok) throw recurrenceValidationFailure(ruleValidation.error);
	const series = await getTaskSeries(trx, input.seriesId);
	if (series === void 0) throw new DomainFailure({
		code: "NotFound",
		entity: "TaskSeries",
		id: input.seriesId
	});
	const guard = revisionGuard(series.revision, input.expectedRevision);
	if (guard !== void 0) throw new DomainFailure(guard);
	const updatedRevision = nextRevision(series.revision);
	const versions = applyRecurrenceRuleChange({
		ruleVersions: series.ruleVersions,
		currentLocalDate: ctx.clock.currentLocalDate(),
		revision: updatedRevision,
		nextRule: ruleValidation.value
	});
	if (!versions.ok) throw recurrenceValidationFailure(versions.error);
	await putTaskSeries(trx, {
		...series,
		ruleVersions: versions.value,
		revision: updatedRevision
	}, series.revision);
	return {
		value: void 0,
		affectedDates: [],
		affectedWeeks: []
	};
}
async function stopTaskSeries(ctx, trx, input) {
	const series = await getTaskSeries(trx, input.seriesId);
	if (series === void 0) throw new DomainFailure({
		code: "NotFound",
		entity: "TaskSeries",
		id: input.seriesId
	});
	const guard = revisionGuard(series.revision, input.expectedRevision);
	if (guard !== void 0) throw new DomainFailure(guard);
	const updatedRevision = nextRevision(series.revision);
	await putTaskSeries(trx, {
		...series,
		ruleVersions: stopRecurrence({
			ruleVersions: series.ruleVersions,
			currentLocalDate: ctx.clock.currentLocalDate(),
			revision: updatedRevision
		}),
		revision: updatedRevision
	}, series.revision);
	return {
		value: void 0,
		affectedDates: [],
		affectedWeeks: []
	};
}
//#endregion
//#region server/planning/plan-entries.ts
/**
* Strips whatever outcome and destination a membership carried and returns it
* to `planned`, keeping its identity and its original `plannedSnapshot`.
*
* This is how an A -> B -> A move reuses one membership instead of creating a
* second one for the same date: the returning task finds its existing row and
* resets it. `UNIQUE (occurrence_id, plan_date)` makes the alternative
* unrepresentable, so a scoring denominator cannot inflate (001 FR-027, FR-048).
*/
function plannedEntry(entry) {
	return {
		id: entry.id,
		occurrenceId: entry.occurrenceId,
		date: entry.date,
		weekStart: entry.weekStart,
		plannedSnapshot: entry.plannedSnapshot,
		enteredAt: entry.enteredAt,
		outcome: "planned"
	};
}
/**
* Resolves the membership a task lands on: the existing one for that date,
* reset to `planned`, or a fresh one snapshotting the plan as committed.
*/
async function resolveDestinationMembership(ctx, trx, input) {
	const existing = await getPlanEntryByOccurrenceDate(trx, input.occurrence.id, input.destinationDate);
	if (existing !== void 0) return plannedEntry(existing);
	const { occurrence } = input;
	return {
		id: ctx.nextId(),
		occurrenceId: occurrence.id,
		date: input.destinationDate,
		weekStart: input.destinationWeekStart,
		plannedSnapshot: {
			title: occurrence.title,
			...occurrence.notes === void 0 ? {} : { notes: occurrence.notes },
			plannedDurationMinutes: input.durationMinutes,
			...occurrence.startTime === void 0 ? {} : { startTime: occurrence.startTime },
			...occurrence.endTime === void 0 ? {} : { endTime: occurrence.endTime }
		},
		enteredAt: input.enteredAt,
		outcome: "planned"
	};
}
//#endregion
//#region server/planning/tasks.ts
async function requireOccurrence(trx, occurrenceId) {
	const occurrence = await getTaskOccurrence(trx, occurrenceId);
	if (occurrence === void 0) throw new DomainFailure({
		code: "NotFound",
		entity: "TaskOccurrence",
		id: occurrenceId
	});
	return occurrence;
}
async function requireDay(trx, date) {
	const day = await getDay(trx, date);
	if (day === void 0) throw new DomainFailure({
		code: "NotFound",
		entity: "Day",
		id: date
	});
	return day;
}
async function requireOwningPeriods(trx, date) {
	const day = await requireDay(trx, date);
	requireOpenDay(day);
	const week = await getWeek(trx, day.weekStart);
	requireOpenWeek(week, day.weekStart);
	return {
		day,
		week
	};
}
/** Bumps the aggregates a dated change invalidates, guarded on what was read. */
async function bumpPeriods(trx, days, weeks) {
	for (const day of days) await putDay(trx, {
		...day,
		revision: nextRevision(day.revision)
	}, day.revision);
	for (const week of weeks) await putWeek(trx, {
		...week,
		revision: nextRevision(week.revision)
	}, week.revision);
}
async function createTask(ctx, trx, input) {
	const title = canonicalRequiredText(input.title, "title");
	if (input.placement.kind === "day" && !isPositiveDuration(input.durationMinutes)) throw new DomainFailure({
		code: "ValidationFailure",
		issues: [{
			field: "durationMinutes",
			message: "Dated tasks require a positive duration"
		}]
	});
	if (input.placement.kind === "day" && !isDayPositionValue(input.dayPosition)) throw new DomainFailure({
		code: "ValidationFailure",
		issues: [{
			field: "dayPosition",
			message: "Dated tasks require a position"
		}]
	});
	if (input.durationMinutes !== void 0 && !isPositiveDuration(input.durationMinutes)) throw new DomainFailure({
		code: "ValidationFailure",
		issues: [{
			field: "durationMinutes",
			message: "Duration must be positive"
		}]
	});
	const timeValidation = validateTaskTimeRange(input.startTime, input.endTime);
	if (!timeValidation.ok) throw new DomainFailure({
		code: "ValidationFailure",
		issues: [{
			field: "endTime",
			message: "End time must be after start time"
		}]
	});
	const timeRange = timeValidation.value;
	const occurrenceId = ctx.nextId();
	const createdSequenceValue = await allocateNextCreationSequence(trx);
	const occurredAt = ctx.clock.now();
	const affectedDates = [];
	const affectedWeeks = [];
	let occurrence;
	let planEntry;
	if (input.placement.kind === "day") {
		const day = await requireDay(trx, input.placement.date);
		const week = await getWeek(trx, day.weekStart);
		requireOpenDay(day);
		requireOpenWeek(week, day.weekStart);
		const duration = input.durationMinutes;
		const position = input.dayPosition;
		if (!isPositiveDuration(duration) || !isDayPositionValue(position)) throw new Error("Validated dated task values disappeared");
		occurrence = {
			id: occurrenceId,
			title,
			...input.notes === void 0 ? {} : { notes: input.notes },
			...timeRange,
			isException: false,
			createdSequence: createdSequenceValue,
			revision: revision(0),
			state: "active",
			placement: input.placement,
			plannedDurationMinutes: duration,
			dayPosition: position,
			completion: "incomplete"
		};
		planEntry = {
			id: ctx.nextId(),
			occurrenceId,
			date: input.placement.date,
			weekStart: day.weekStart,
			plannedSnapshot: {
				title,
				...input.notes === void 0 ? {} : { notes: input.notes },
				plannedDurationMinutes: duration,
				...timeRange
			},
			enteredAt: occurredAt,
			outcome: "planned"
		};
		await bumpPeriods(trx, [day], [week]);
		affectedDates.push(day.date);
		affectedWeeks.push(day.weekStart);
	} else occurrence = {
		id: occurrenceId,
		title,
		...input.notes === void 0 ? {} : { notes: input.notes },
		...timeRange,
		isException: false,
		createdSequence: createdSequenceValue,
		revision: revision(0),
		state: "active",
		placement: { kind: "backlog" },
		...input.durationMinutes === void 0 ? {} : { plannedDurationMinutes: input.durationMinutes }
	};
	await insertTaskOccurrence(trx, occurrence);
	if (planEntry !== void 0) await insertPlanEntry(trx, planEntry);
	const sequence = await allocateNextEventSequence(trx);
	await insertTaskEvent(trx, {
		id: ctx.nextId(),
		sequence,
		occurrenceId,
		...planEntry === void 0 ? {} : { planEntryId: planEntry.id },
		effectiveDate: input.placement.kind === "day" ? input.placement.date : ctx.clock.currentLocalDate(),
		occurredAt,
		type: "create",
		payload: {
			created: taskValueSnapshot(occurrence),
			placement: occurrence.placement
		}
	});
	return {
		value: occurrenceId,
		affectedDates,
		affectedWeeks
	};
}
async function editTaskOccurrence(ctx, trx, input) {
	const occurrence = await requireOccurrence(trx, input.occurrenceId);
	const guard = revisionGuard(occurrence.revision, input.expectedRevision);
	if (guard !== void 0) throw new DomainFailure(guard);
	if (occurrence.state === "deleted" || occurrence.state === "finalized") throw new DomainFailure({
		code: "InvalidTransition",
		entity: "TaskOccurrence",
		currentState: occurrence.state,
		attemptedTransition: "edit"
	});
	let title = occurrence.title;
	if (input.title !== void 0) title = canonicalRequiredText(input.title, "title");
	const duration = input.durationMinutes ?? occurrence.plannedDurationMinutes;
	if (occurrence.placement.kind === "day" && !isPositiveDuration(duration)) throw new DomainFailure({
		code: "ValidationFailure",
		issues: [{
			field: "durationMinutes",
			message: "Dated tasks require a positive duration"
		}]
	});
	if (duration !== void 0 && !isPositiveDuration(duration)) throw new DomainFailure({
		code: "ValidationFailure",
		issues: [{
			field: "durationMinutes",
			message: "Duration must be positive"
		}]
	});
	const nextStartTime = input.startTime === null ? void 0 : input.startTime;
	const nextEndTime = input.endTime === null ? void 0 : input.endTime;
	const timeValidation = validateTaskTimeRange(input.startTime === void 0 ? occurrence.startTime : nextStartTime, input.endTime === void 0 ? occurrence.endTime : nextEndTime);
	if (!timeValidation.ok) throw new DomainFailure({
		code: "ValidationFailure",
		issues: [{
			field: "endTime",
			message: "End time must be after start time"
		}]
	});
	const updated = {
		...occurrence,
		title,
		...input.notes === void 0 ? {} : { notes: input.notes },
		...duration === void 0 ? {} : { plannedDurationMinutes: duration },
		startTime: timeValidation.value.startTime,
		endTime: timeValidation.value.endTime,
		isException: occurrence.seriesId === void 0 ? occurrence.isException : true,
		revision: nextRevision(occurrence.revision)
	};
	const affectedDates = [];
	const affectedWeeks = [];
	if (occurrence.placement.kind === "day") {
		const { day, week } = await requireOwningPeriods(trx, occurrence.placement.date);
		await bumpPeriods(trx, [day], [week]);
		affectedDates.push(day.date);
		affectedWeeks.push(day.weekStart);
	}
	await putTaskOccurrence(trx, updated, occurrence.revision);
	const sequence = await allocateNextEventSequence(trx);
	const eventBase = {
		id: ctx.nextId(),
		sequence,
		occurrenceId: occurrence.id,
		...occurrence.seriesId === void 0 ? {} : { seriesId: occurrence.seriesId },
		effectiveDate: occurrence.placement.kind === "day" ? occurrence.placement.date : ctx.clock.currentLocalDate(),
		occurredAt: ctx.clock.now()
	};
	await insertTaskEvent(trx, occurrence.seriesId === void 0 ? {
		...eventBase,
		type: "edit",
		payload: {
			before: taskValueSnapshot(occurrence),
			after: taskValueSnapshot(updated)
		}
	} : {
		...eventBase,
		seriesId: occurrence.seriesId,
		type: "occurrence-exception",
		payload: {
			before: taskValueSnapshot(occurrence),
			after: taskValueSnapshot(updated)
		}
	});
	return {
		value: void 0,
		affectedDates,
		affectedWeeks
	};
}
async function setTaskCompletion(ctx, trx, input) {
	const occurrence = await requireOccurrence(trx, input.occurrenceId);
	const revisionError = revisionGuard(occurrence.revision, input.expectedRevision);
	if (revisionError !== void 0) throw new DomainFailure(revisionError);
	if (occurrence.state !== "active" || occurrence.placement.kind !== "day" || !("completion" in occurrence) || occurrence.placement.date !== input.date) throw new DomainFailure({
		code: "InvalidTransition",
		entity: "TaskOccurrence",
		currentState: `${occurrence.state}/${occurrence.placement.kind}`,
		attemptedTransition: input.completed ? "completion-checked" : "completion-unchecked"
	});
	if (input.completed && occurrence.completion === "completed" || !input.completed && occurrence.completion === "incomplete") throw new DomainFailure({
		code: "InvalidTransition",
		entity: "TaskOccurrence",
		currentState: occurrence.completion,
		attemptedTransition: input.completed ? "completion-checked" : "completion-unchecked"
	});
	const { day, week } = await requireOwningPeriods(trx, input.date);
	const entry = await getPlanEntryByOccurrenceDate(trx, occurrence.id, input.date);
	if (entry === void 0) throw new DomainFailure({
		code: "NotFound",
		entity: "TaskPlanEntry",
		id: `${occurrence.id}/${input.date}`
	});
	const occurredAt = ctx.clock.now();
	let updated;
	if (input.completed) updated = {
		...occurrence,
		completion: "completed",
		actualCompletedAt: occurredAt,
		revision: nextRevision(occurrence.revision)
	};
	else {
		if (occurrence.completion !== "completed") throw new Error("Validated completed occurrence disappeared");
		const { actualCompletedAt: _actualCompletedAt, ...withoutActual } = occurrence;
		updated = {
			...withoutActual,
			completion: "incomplete",
			revision: nextRevision(occurrence.revision)
		};
	}
	await putTaskOccurrence(trx, updated, occurrence.revision);
	await putPlanEntry(trx, input.completed ? {
		...plannedEntry(entry),
		outcome: "completed"
	} : plannedEntry(entry));
	await bumpPeriods(trx, [day], [week]);
	const sequence = await allocateNextEventSequence(trx);
	await insertTaskEvent(trx, {
		id: ctx.nextId(),
		sequence,
		occurrenceId: occurrence.id,
		planEntryId: entry.id,
		effectiveDate: input.date,
		occurredAt,
		type: input.completed ? "completion-checked" : "completion-unchecked",
		payload: { date: input.date }
	});
	return {
		value: void 0,
		affectedDates: [day.date],
		affectedWeeks: [day.weekStart]
	};
}
async function moveTaskToDate(ctx, trx, input) {
	if (!isPositiveDuration(input.durationMinutes)) throw new DomainFailure({
		code: "ValidationFailure",
		issues: [{
			field: "durationMinutes",
			message: "Dated tasks require a positive duration"
		}]
	});
	if (!isDayPositionValue(input.dayPosition)) throw new DomainFailure({
		code: "ValidationFailure",
		issues: [{
			field: "dayPosition",
			message: "Dated tasks require a position"
		}]
	});
	const occurrence = await requireOccurrence(trx, input.occurrenceId);
	const revisionError = revisionGuard(occurrence.revision, input.expectedRevision);
	if (revisionError !== void 0) throw new DomainFailure(revisionError);
	if (occurrence.state !== "active") throw new DomainFailure({
		code: "InvalidTransition",
		entity: "TaskOccurrence",
		currentState: occurrence.state,
		attemptedTransition: "move-to-date"
	});
	if (occurrence.placement.kind === "day" && (!("completion" in occurrence) || occurrence.completion !== "incomplete")) throw new DomainFailure({
		code: "TaskMustBeIncompleteToMove",
		occurrenceId: occurrence.id
	});
	if (occurrence.placement.kind === "day" && occurrence.placement.date === input.destinationDate) throw new DomainFailure({
		code: "InvalidTransition",
		entity: "TaskOccurrence",
		currentState: `day:${occurrence.placement.date}`,
		attemptedTransition: `move-to-same-date:${input.destinationDate}`
	});
	const destinationDay = await getDay(trx, input.destinationDate);
	if (destinationDay === void 0) throw new DomainFailure({
		code: "NotFound",
		entity: "Day",
		id: input.destinationDate
	});
	if (destinationDay.status !== "open") throw new DomainFailure({
		code: "MoveTargetClosed",
		destinationDate: input.destinationDate
	});
	const destinationWeek = await getWeek(trx, destinationDay.weekStart);
	if (destinationWeek?.status !== "open") throw new DomainFailure({
		code: "MoveTargetClosed",
		destinationDate: input.destinationDate
	});
	let sourceDay;
	let sourceWeek;
	let sourceEntry;
	if (occurrence.placement.kind === "day") {
		const source = await requireDay(trx, occurrence.placement.date);
		requireOpenDay(source);
		sourceDay = source;
		const owningWeek = await getWeek(trx, source.weekStart);
		requireOpenWeek(owningWeek, source.weekStart);
		sourceWeek = owningWeek;
		sourceEntry = await getPlanEntryByOccurrenceDate(trx, occurrence.id, source.date);
		if (sourceEntry === void 0) throw new DomainFailure({
			code: "NotFound",
			entity: "TaskPlanEntry",
			id: `${occurrence.id}/${source.date}`
		});
	}
	const occurredAt = ctx.clock.now();
	const destinationEntry = await resolveDestinationMembership(ctx, trx, {
		occurrence,
		destinationDate: input.destinationDate,
		destinationWeekStart: destinationDay.weekStart,
		durationMinutes: input.durationMinutes,
		enteredAt: occurredAt
	});
	if (sourceEntry !== void 0) await putPlanEntry(trx, {
		...sourceEntry,
		outcome: "moved",
		destination: {
			kind: "day",
			date: input.destinationDate
		}
	});
	await putPlanEntry(trx, destinationEntry);
	await putTaskOccurrence(trx, {
		...occurrence,
		state: "active",
		placement: {
			kind: "day",
			date: input.destinationDate
		},
		plannedDurationMinutes: input.durationMinutes,
		dayPosition: input.dayPosition,
		completion: "incomplete",
		revision: nextRevision(occurrence.revision)
	}, occurrence.revision);
	const affectedDays = /* @__PURE__ */ new Map();
	if (sourceDay !== void 0) affectedDays.set(sourceDay.date, sourceDay);
	affectedDays.set(destinationDay.date, destinationDay);
	const affectedWeekRecords = /* @__PURE__ */ new Map();
	if (sourceWeek !== void 0) affectedWeekRecords.set(sourceWeek.startDate, sourceWeek);
	affectedWeekRecords.set(destinationWeek.startDate, destinationWeek);
	await bumpPeriods(trx, [...affectedDays.values()], [...affectedWeekRecords.values()]);
	const sequence = await allocateNextEventSequence(trx);
	await insertTaskEvent(trx, occurrence.placement.kind === "backlog" ? {
		id: ctx.nextId(),
		sequence,
		occurrenceId: occurrence.id,
		planEntryId: destinationEntry.id,
		effectiveDate: input.destinationDate,
		occurredAt,
		type: "schedule-from-backlog",
		payload: {
			from: { kind: "backlog" },
			destination: {
				kind: "day",
				date: input.destinationDate
			}
		}
	} : {
		id: ctx.nextId(),
		sequence,
		occurrenceId: occurrence.id,
		planEntryId: destinationEntry.id,
		effectiveDate: input.destinationDate,
		occurredAt,
		type: "move-to-date",
		payload: {
			from: occurrence.placement,
			destination: {
				kind: "day",
				date: input.destinationDate
			}
		}
	});
	return {
		value: void 0,
		affectedDates: [...affectedDays.keys()],
		affectedWeeks: [...affectedWeekRecords.keys()]
	};
}
async function moveTaskToBacklog(ctx, trx, input) {
	const occurrence = await requireOccurrence(trx, input.occurrenceId);
	const revisionError = revisionGuard(occurrence.revision, input.expectedRevision);
	if (revisionError !== void 0) throw new DomainFailure(revisionError);
	if (occurrence.state !== "active" || occurrence.placement.kind !== "day" || !("completion" in occurrence)) throw new DomainFailure({
		code: "InvalidTransition",
		entity: "TaskOccurrence",
		currentState: `${occurrence.state}/${occurrence.placement.kind}`,
		attemptedTransition: "move-to-backlog"
	});
	if (occurrence.completion !== "incomplete") throw new DomainFailure({
		code: "TaskMustBeIncompleteToMove",
		occurrenceId: occurrence.id
	});
	const { day, week } = await requireOwningPeriods(trx, occurrence.placement.date);
	const entry = await getPlanEntryByOccurrenceDate(trx, occurrence.id, day.date);
	if (entry === void 0) throw new DomainFailure({
		code: "NotFound",
		entity: "TaskPlanEntry",
		id: `${occurrence.id}/${day.date}`
	});
	await putTaskOccurrence(trx, {
		...occurrence,
		state: "active",
		placement: { kind: "backlog" },
		revision: nextRevision(occurrence.revision)
	}, occurrence.revision);
	await putPlanEntry(trx, {
		...entry,
		outcome: "backlogged",
		destination: { kind: "backlog" }
	});
	await bumpPeriods(trx, [day], [week]);
	const sequence = await allocateNextEventSequence(trx);
	await insertTaskEvent(trx, {
		id: ctx.nextId(),
		sequence,
		occurrenceId: occurrence.id,
		planEntryId: entry.id,
		effectiveDate: day.date,
		occurredAt: ctx.clock.now(),
		type: "move-to-backlog",
		payload: {
			from: {
				kind: "day",
				date: day.date
			},
			destination: { kind: "backlog" }
		}
	});
	return {
		value: void 0,
		affectedDates: [day.date],
		affectedWeeks: [day.weekStart]
	};
}
async function deleteTaskOccurrence(ctx, trx, input) {
	const occurrence = await requireOccurrence(trx, input.occurrenceId);
	const revisionError = revisionGuard(occurrence.revision, input.expectedRevision);
	if (revisionError !== void 0) throw new DomainFailure(revisionError);
	if (occurrence.state === "deleted" || occurrence.state === "finalized") throw new DomainFailure({
		code: "InvalidTransition",
		entity: "TaskOccurrence",
		currentState: occurrence.state,
		attemptedTransition: "delete"
	});
	const entries = await getPlanEntriesByOccurrence(trx, occurrence.id);
	const affectedDays = /* @__PURE__ */ new Map();
	const affectedWeeks = /* @__PURE__ */ new Map();
	for (const entry of entries) {
		const day = await getDay(trx, entry.date);
		if (day === void 0 || day.status === "closed") continue;
		affectedDays.set(day.date, day);
		const week = await getWeek(trx, day.weekStart);
		if (week?.status === "open") affectedWeeks.set(week.startDate, week);
		await putPlanEntry(trx, {
			id: entry.id,
			occurrenceId: entry.occurrenceId,
			date: entry.date,
			weekStart: entry.weekStart,
			plannedSnapshot: entry.plannedSnapshot,
			enteredAt: entry.enteredAt,
			outcome: "deleted"
		});
	}
	await bumpPeriods(trx, [...affectedDays.values()], [...affectedWeeks.values()]);
	await putTaskOccurrence(trx, {
		id: occurrence.id,
		...occurrence.seriesId === void 0 ? {} : { seriesId: occurrence.seriesId },
		...occurrence.nominalDate === void 0 ? {} : { nominalDate: occurrence.nominalDate },
		...occurrence.ruleRevision === void 0 ? {} : { ruleRevision: occurrence.ruleRevision },
		title: occurrence.title,
		...occurrence.notes === void 0 ? {} : { notes: occurrence.notes },
		isException: occurrence.isException,
		createdSequence: occurrence.createdSequence,
		revision: nextRevision(occurrence.revision),
		state: "deleted",
		placement: { kind: "none" },
		...occurrence.plannedDurationMinutes === void 0 ? {} : { plannedDurationMinutes: occurrence.plannedDurationMinutes }
	}, occurrence.revision);
	const sequence = await allocateNextEventSequence(trx);
	await insertTaskEvent(trx, {
		id: ctx.nextId(),
		sequence,
		occurrenceId: occurrence.id,
		effectiveDate: ctx.clock.currentLocalDate(),
		occurredAt: ctx.clock.now(),
		type: "delete",
		payload: { previousPlacement: occurrence.placement }
	});
	return {
		value: void 0,
		affectedDates: [...affectedDays.keys()],
		affectedWeeks: [...affectedWeeks.keys()]
	};
}
async function reorderDatedTasks(_ctx, trx, input) {
	const day = await requireDay(trx, input.date);
	requireOpenDay(day, input.expectedDayRevision);
	const week = await getWeek(trx, day.weekStart);
	requireOpenWeek(week, day.weekStart);
	const current = (await getTaskOccurrencesPlacedOn(trx, input.date)).filter((occurrence) => occurrence.state === "active" && occurrence.placement.kind === "day" && occurrence.placement.date === input.date);
	const byId = new Map(current.map((occurrence) => [occurrence.id, occurrence]));
	if (input.orderedOccurrenceIds.length !== current.length || new Set(input.orderedOccurrenceIds).size !== input.orderedOccurrenceIds.length || input.orderedOccurrenceIds.some((id) => !byId.has(id))) throw new DomainFailure({
		code: "ValidationFailure",
		issues: [{
			field: "orderedOccurrenceIds",
			message: "Dated order must contain every current task once"
		}]
	});
	for (const [position, occurrenceId] of input.orderedOccurrenceIds.entries()) {
		const occurrence = byId.get(occurrenceId);
		if (occurrence?.state !== "active" || occurrence.placement.kind !== "day") throw new Error("Validated dated occurrence is missing");
		await putTaskOccurrence(trx, {
			...occurrence,
			dayPosition: position,
			revision: nextRevision(occurrence.revision)
		}, occurrence.revision);
	}
	await bumpPeriods(trx, [day], [week]);
	return {
		value: void 0,
		affectedDates: [input.date],
		affectedWeeks: [day.weekStart]
	};
}
//#endregion
//#region src/entities/planning/model/week-completion.ts
function countPair(category) {
	return {
		completed: category.completed,
		applicable: category.applicable
	};
}
function addCounts(left, right) {
	return {
		completed: left.completed + right.completed,
		applicable: left.applicable + right.applicable
	};
}
function aggregateFrozenCounts(days) {
	return days.reduce((total, day) => ({
		task: addCounts(total.task, countPair(day.closureSnapshot.score.task)),
		habit: addCounts(total.habit, countPair(day.closureSnapshot.score.habit))
	}), {
		task: {
			completed: 0,
			applicable: 0
		},
		habit: {
			completed: 0,
			applicable: 0
		}
	});
}
function orderExactOwnedDays(week, days) {
	const expectedDates = weekDates(week.startDate);
	const receivedDates = days.map((day) => day.date);
	const uniqueDates = new Set(receivedDates);
	if (!(startOfWeek(week.startDate) === week.startDate && days.length === expectedDates.length && uniqueDates.size === days.length && days.every((day) => day.weekStart === week.startDate && expectedDates.includes(day.date)))) return err({
		code: "WeekDaysMismatch",
		weekStart: week.startDate,
		expectedDates,
		receivedDates
	});
	return ok(days.toSorted((left, right) => compareLocalDates(left.date, right.date)));
}
/** Prepares one immutable Week write after validating all seven frozen Day facts. */
function prepareWeekCompletion(input) {
	if (isCompletedWeek(input.week)) return err({
		code: "PeriodImmutable",
		weekStart: input.week.startDate
	});
	const ordered = orderExactOwnedDays(input.week, input.days);
	if (!ordered.ok) return ordered;
	const openDates = ordered.value.filter((day) => day.status === "open").map((day) => day.date);
	if (openDates.length > 0) return err({
		code: "WeekNotClosable",
		weekStart: input.week.startDate,
		openDates
	});
	const closedDays = ordered.value;
	const progress = calculateCompletionScore(aggregateFrozenCounts(closedDays));
	const reflection = input.reflection ?? input.week.reflection;
	return ok({
		week: {
			startDate: input.week.startDate,
			goals: input.week.goals,
			status: "completed",
			...reflection === void 0 ? {} : { reflection },
			completionSnapshot: { progress },
			completedAt: input.clock.now(),
			revision: nextRevision(input.week.revision)
		},
		days: closedDays
	});
}
//#endregion
//#region server/planning/week-completion.ts
async function completeWeek(ctx, trx, input) {
	const week = await getWeek(trx, input.weekStart);
	if (week === void 0) throw new DomainFailure({
		code: "NotFound",
		entity: "Week",
		id: input.weekStart
	});
	requireOpenWeek(week, input.weekStart, input.expectedWeekRevision);
	const prepared = prepareWeekCompletion({
		week,
		days: await getDaysByWeekStart(trx, input.weekStart),
		...input.reflection === void 0 ? {} : { reflection: input.reflection },
		clock: ctx.clock
	});
	if (!prepared.ok) throw weekCompletionFailure(prepared.error);
	await putWeek(trx, prepared.value.week, week.revision);
	return {
		value: prepared.value.week.completionSnapshot,
		affectedDates: [],
		affectedWeeks: [prepared.value.week.startDate]
	};
}
//#endregion
//#region server/planning/weeks.ts
async function ensureCalendarWeek(_ctx, trx, { date }) {
	const weekStart = startOfWeek(date);
	const existingWeek = await getWeek(trx, weekStart);
	const createdDates = [];
	if (existingWeek === void 0) await insertWeek(trx, {
		startDate: weekStart,
		status: "open",
		goals: [],
		revision: revision(0)
	});
	for (const ownedDate of weekDates(weekStart)) if (await getDay(trx, ownedDate) === void 0) {
		await insertDay(trx, {
			date: ownedDate,
			weekStart,
			status: "open",
			revision: revision(0)
		});
		createdDates.push(ownedDate);
	}
	return {
		value: weekStart,
		affectedDates: createdDates,
		affectedWeeks: existingWeek === void 0 ? [weekStart] : []
	};
}
async function addWeeklyGoal(ctx, trx, input) {
	const statement = canonicalRequiredText(input.statement, "statement");
	const week = await getWeek(trx, input.weekStart);
	requireOpenWeek(week, input.weekStart, input.expectedRevision);
	const occurredAt = ctx.clock.now();
	const goalId = ctx.nextId();
	const goal = {
		id: goalId,
		statement,
		createdAt: occurredAt,
		updatedAt: occurredAt
	};
	await putWeek(trx, {
		...week,
		goals: [...week.goals, goal],
		revision: nextRevision(week.revision)
	}, week.revision);
	return {
		value: goalId,
		affectedDates: [],
		affectedWeeks: [input.weekStart]
	};
}
async function editWeeklyGoal(ctx, trx, input) {
	const statement = canonicalRequiredText(input.statement, "statement");
	const week = await getWeek(trx, input.weekStart);
	requireOpenWeek(week, input.weekStart, input.expectedRevision);
	const index = week.goals.findIndex((goal) => goal.id === input.goalId);
	if (index < 0) throw new DomainFailure({
		code: "NotFound",
		entity: "WeeklyGoal",
		id: input.goalId
	});
	const goals = week.goals.slice();
	const current = goals[index];
	if (current === void 0) throw new Error("Goal index disappeared");
	goals[index] = {
		...current,
		statement,
		updatedAt: ctx.clock.now()
	};
	await putWeek(trx, {
		...week,
		goals,
		revision: nextRevision(week.revision)
	}, week.revision);
	return {
		value: void 0,
		affectedDates: [],
		affectedWeeks: [input.weekStart]
	};
}
async function reorderWeeklyGoals(_ctx, trx, input) {
	const week = await getWeek(trx, input.weekStart);
	requireOpenWeek(week, input.weekStart, input.expectedRevision);
	const goalsById = new Map(week.goals.map((goal) => [goal.id, goal]));
	if (input.orderedGoalIds.length !== week.goals.length || new Set(input.orderedGoalIds).size !== input.orderedGoalIds.length || input.orderedGoalIds.some((id) => !goalsById.has(id))) throw new DomainFailure({
		code: "ValidationFailure",
		issues: [{
			field: "orderedGoalIds",
			message: "Goal order must contain every goal once"
		}]
	});
	const goals = input.orderedGoalIds.map((id) => {
		const goal = goalsById.get(id);
		if (goal === void 0) throw new Error("Validated goal is missing");
		return goal;
	});
	await putWeek(trx, {
		...week,
		goals,
		revision: nextRevision(week.revision)
	}, week.revision);
	return {
		value: void 0,
		affectedDates: [],
		affectedWeeks: [input.weekStart]
	};
}
async function deleteWeeklyGoal(_ctx, trx, input) {
	const week = await getWeek(trx, input.weekStart);
	requireOpenWeek(week, input.weekStart, input.expectedRevision);
	if (!week.goals.some((goal) => goal.id === input.goalId)) throw new DomainFailure({
		code: "NotFound",
		entity: "WeeklyGoal",
		id: input.goalId
	});
	await putWeek(trx, {
		...week,
		goals: week.goals.filter((goal) => goal.id !== input.goalId),
		revision: nextRevision(week.revision)
	}, week.revision);
	return {
		value: void 0,
		affectedDates: [],
		affectedWeeks: [input.weekStart]
	};
}
//#endregion
//#region server/planning/transaction.ts
/**
* One boundary operation, one transaction (research Decision 7). `READ
* COMMITTED` is the default isolation level; the optimistic-concurrency
* guarantee comes from `updateGuarded` below rather than from the isolation
* level, exactly as it did under IndexedDB.
*/
async function runCommand(db, work) {
	try {
		const receipt = await db.transaction().setIsolationLevel("read committed").execute((trx) => work(trx));
		return {
			ok: true,
			value: receipt.value,
			affectedDates: receipt.affectedDates,
			affectedWeeks: receipt.affectedWeeks
		};
	} catch (error) {
		return {
			ok: false,
			error: toDomainOrServerError(error)
		};
	}
}
/**
* A read projection is assembled from several queries, so it runs at
* `REPEATABLE READ` to see one consistent snapshot: without it, a command
* committing between two statements could produce a view that never existed
* (research Decision 7).
*/
async function runRead(db, work) {
	try {
		return {
			ok: true,
			value: await db.transaction().setIsolationLevel("repeatable read").setAccessMode("read only").execute((trx) => work(trx))
		};
	} catch (error) {
		return {
			ok: false,
			error: toDomainOrServerError(error)
		};
	}
}
/** Converts a thrown domain failure back into a query result value. */
function queryFailure(error) {
	return {
		ok: false,
		error: toDomainOrServerError(error)
	};
}
//#endregion
//#region server/planning/postgres-planning-repository.ts
/**
* The authoritative implementation of `PlanningRepository`.
*
* It is a facade: every method opens exactly one transaction — a command
* transaction for a mutation, a `REPEATABLE READ` read transaction for a
* projection — and delegates the work to the concern module that owns it. The
* domain rules themselves are unchanged; they live in `src/entities/planning/
* model/` and are shared with the browser.
*
* The injected clock is passed through untouched. The server never reads its
* own time (002 FR-009).
*/
function createPostgresPlanningRepository(db, dependencies) {
	const ctx = createRepositoryContext(dependencies);
	return {
		getWeekView: (dateOrWeekStart) => runRead(db, (trx) => getWeekView(trx, dateOrWeekStart)),
		getDayView: (date) => runRead(db, (trx) => getDayView(trx, date)),
		getBacklogView: () => runRead(db, (trx) => getBacklogView(trx)),
		getHistoryView: async (query) => {
			try {
				const range = deriveHistoryRange(query);
				return await runRead(db, (trx) => getHistoryView(trx, query, range));
			} catch (error) {
				return queryFailure(error);
			}
		},
		getTaskHistory: (occurrenceId) => runRead(db, (trx) => getTaskHistory(trx, occurrenceId)),
		prepareOpenPeriod: (range) => runCommand(db, (trx) => prepareOpenPeriod(ctx, trx, range)),
		ensureCalendarWeek: (input) => runCommand(db, (trx) => ensureCalendarWeek(ctx, trx, input)),
		addWeeklyGoal: (input) => runCommand(db, (trx) => addWeeklyGoal(ctx, trx, input)),
		editWeeklyGoal: (input) => runCommand(db, (trx) => editWeeklyGoal(ctx, trx, input)),
		reorderWeeklyGoals: (input) => runCommand(db, (trx) => reorderWeeklyGoals(ctx, trx, input)),
		deleteWeeklyGoal: (input) => runCommand(db, (trx) => deleteWeeklyGoal(ctx, trx, input)),
		createTask: (input) => runCommand(db, (trx) => createTask(ctx, trx, input)),
		editTaskOccurrence: (input) => runCommand(db, (trx) => editTaskOccurrence(ctx, trx, input)),
		setTaskCompletion: (input) => runCommand(db, (trx) => setTaskCompletion(ctx, trx, input)),
		moveTaskToDate: (input) => runCommand(db, (trx) => moveTaskToDate(ctx, trx, input)),
		moveTaskToBacklog: (input) => runCommand(db, (trx) => moveTaskToBacklog(ctx, trx, input)),
		deleteTaskOccurrence: (input) => runCommand(db, (trx) => deleteTaskOccurrence(ctx, trx, input)),
		reorderDatedTasks: (input) => runCommand(db, (trx) => reorderDatedTasks(ctx, trx, input)),
		createTaskSeries: (input) => runCommand(db, (trx) => createTaskSeries(ctx, trx, input)),
		updateTaskSeriesRule: (input) => runCommand(db, (trx) => updateTaskSeriesRule(ctx, trx, input)),
		stopTaskSeries: (input) => runCommand(db, (trx) => stopTaskSeries(ctx, trx, input)),
		createHabitDefinition: (input) => runCommand(db, (trx) => createHabitDefinition(ctx, trx, input)),
		updateHabitRule: (input) => runCommand(db, (trx) => updateHabitRule(ctx, trx, input)),
		stopHabitDefinition: (input) => runCommand(db, (trx) => stopHabitDefinition(ctx, trx, input)),
		editHabitOccurrence: (input) => runCommand(db, (trx) => editHabitOccurrence(ctx, trx, input)),
		recordHabitOutcome: (input) => runCommand(db, (trx) => recordHabitOutcome(ctx, trx, input)),
		correctBoundaryMissToCompleted: (input) => runCommand(db, (trx) => correctBoundaryMissToCompleted(ctx, trx, input)),
		clearHabitOutcome: (input) => runCommand(db, (trx) => clearHabitOutcome(ctx, trx, input)),
		deleteHabitOccurrence: (input) => runCommand(db, (trx) => deleteHabitOccurrence(ctx, trx, input)),
		saveDailyState: (input) => runCommand(db, (trx) => saveDailyState(ctx, trx, input)),
		closeDay: (input) => runCommand(db, (trx) => closeDay(ctx, trx, input)),
		completeWeek: (input) => runCommand(db, (trx) => completeWeek(ctx, trx, input)),
		auditContext: () => ({
			id: generateEntityId(dependencies.generateUuid),
			occurredAt: dependencies.clock.now()
		})
	};
}
//#endregion
//#region server/main.ts
/**
* Startup order is load-bearing: migrations complete before the server accepts
* a single request, so a first run against an empty volume yields a working,
* empty ORBIT rather than an error (FR-004, FR-019).
*/
async function main() {
	const config = readServerConfig();
	const handle = createPlanningDatabase({ connectionString: config.databaseUrl });
	await runMigrations(handle.db);
	const app = await createApp({
		db: handle.db,
		createRepository: (clock) => createPostgresPlanningRepository(handle.db, { clock }),
		serveStaticClient: config.nodeEnv === "production",
		logger: true
	});
	const shutdown = async () => {
		await app.close();
		await handle.destroy();
	};
	for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => {
		shutdown().finally(() => {
			process.exit(0);
		});
	});
	await app.listen({
		port: config.port,
		host: "0.0.0.0"
	});
}
main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
//#endregion
export {};
