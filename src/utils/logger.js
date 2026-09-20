/**
 * File: src/utils/logger.js
 * Description: Unified Logger SDK providing structured logging, levels, and FSM transition observability
 *
 * Standardized Logger module for AIStudioToAPI.
 * Wraps LoggingService for backward compatibility and adds standard logging primitives.
 */

const LoggingService = require("./LoggingService");

class Logger {
    constructor(serviceName = "AIStudioToAPI") {
        this.serviceName = serviceName;
        this.service = new LoggingService(serviceName);
    }

    info(message, ...args) {
        const extra =
            args.length > 0 ? " " + args.map(a => (typeof a === "object" ? JSON.stringify(a) : a)).join(" ") : "";
        this.service.info(`${message}${extra}`);
    }

    error(message, ...args) {
        const extra =
            args.length > 0 ? " " + args.map(a => (typeof a === "object" ? JSON.stringify(a) : a)).join(" ") : "";
        this.service.error(`${message}${extra}`);
    }

    warn(message, ...args) {
        const extra =
            args.length > 0 ? " " + args.map(a => (typeof a === "object" ? JSON.stringify(a) : a)).join(" ") : "";
        this.service.warn(`${message}${extra}`);
    }

    debug(message, ...args) {
        const extra =
            args.length > 0 ? " " + args.map(a => (typeof a === "object" ? JSON.stringify(a) : a)).join(" ") : "";
        this.service.debug(`${message}${extra}`);
    }

    /**
     * Standard FSM Transition Observer Log
     * Emits structured [FSM_TRANSITION] log compatible with Phase 222 observability specs.
     */
    fsmTransition(event) {
        const payloadStr = event.payload !== undefined ? ` payload=${JSON.stringify(event.payload)}` : "";
        const logMsg = `[FSM_TRANSITION] fsm=${event.fsm} from=${event.from} event=${event.event} to=${event.to}${payloadStr}`;
        this.info(logMsg);
    }
}

const defaultLogger = new Logger("AIStudioToAPI");

module.exports = defaultLogger;
module.exports.Logger = Logger;
module.exports.LoggingService = LoggingService;
