"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LeaderMonitor = void 0;
const events_1 = __importDefault(require("events"));
const types_1 = require("../types");
class LeaderMonitor extends events_1.default {
    connection;
    log;
    currentSlot = 0;
    currentEpoch = 0;
    cachedSchedule = null;
    knownJitoValidators;
    scheduleRefreshInterval = null;
    constructor(connection, log) {
        super();
        this.connection = connection;
        this.log = log;
        this.knownJitoValidators = new Set(types_1.JITO_KNOWN_VALIDATORS);
    }
    async start() {
        await this.refreshEpoch();
        this.scheduleRefreshInterval = setInterval(() => {
            this.refreshEpoch();
        }, 60_000);
    }
    async refreshEpoch() {
        try {
            const epochInfo = await this.connection.getEpochInfo();
            this.currentEpoch = epochInfo.epoch;
            if (!this.cachedSchedule ||
                this.cachedSchedule.epoch !== epochInfo.epoch) {
                await this.fetchLeaderSchedule(epochInfo.epoch);
            }
        }
        catch (err) {
            this.log.error('Failed to refresh epoch', {
                error: err.message,
            });
        }
    }
    async fetchLeaderSchedule(epoch) {
        try {
            const schedule = await this.connection.getLeaderSchedule();
            const scheduleMap = new Map();
            const slotIndices = new Map();
            for (const [pubkey, slots] of Object.entries(schedule)) {
                const validSlots = slots.map((s) => Number(s));
                scheduleMap.set(pubkey, validSlots);
                for (const slot of validSlots) {
                    slotIndices.set(slot, pubkey);
                }
            }
            this.cachedSchedule = {
                epoch,
                schedule: scheduleMap,
                slotIndices,
                fetchedAt: Date.now(),
            };
            this.log.info('Leader schedule fetched', {
                epoch,
                numLeaders: scheduleMap.size,
                totalSlots: slotIndices.size,
            });
        }
        catch (err) {
            this.log.error('Failed to fetch leader schedule', {
                error: err.message,
            });
        }
    }
    handleSlotUpdate(event) {
        this.currentSlot = event.slot;
        const currentLeader = this.getLeaderForSlot(event.slot);
        const jitoInfo = this.getNextJitoLeader(event.slot);
        const congestionLevel = this.estimateCongestion(event.slot);
        if (currentLeader) {
            this.emit(types_1.ServiceEvent.LEADER_CHANGE, {
                slot: event.slot,
                leader: currentLeader,
                isJito: this.knownJitoValidators.has(currentLeader),
                nextJitoLeaderSlot: jitoInfo.nextSlot,
                slotsUntilJito: jitoInfo.slotsUntil,
                congestionLevel,
            });
        }
    }
    getNetworkConditions() {
        const jitoInfo = this.getNextJitoLeader(this.currentSlot);
        const leader = this.getLeaderForSlot(this.currentSlot);
        return {
            currentSlot: this.currentSlot,
            currentLeader: leader ?? '',
            nextJitoLeaderSlot: jitoInfo.nextSlot,
            slotsUntilJito: jitoInfo.slotsUntil,
            recentTipPercentile: 0,
            congestionLevel: this.estimateCongestion(this.currentSlot),
        };
    }
    getLeaderForSlot(slot) {
        if (!this.cachedSchedule)
            return null;
        return this.cachedSchedule.slotIndices.get(slot) ?? null;
    }
    getNextJitoLeader(fromSlot) {
        if (!this.cachedSchedule) {
            return { nextSlot: fromSlot + 400, slotsUntil: 400 };
        }
        const sortedSlots = Array.from(this.cachedSchedule.slotIndices.keys()).sort((a, b) => a - b);
        for (const slot of sortedSlots) {
            if (slot > fromSlot) {
                const leader = this.cachedSchedule.slotIndices.get(slot);
                if (leader && this.knownJitoValidators.has(leader)) {
                    return { nextSlot: slot, slotsUntil: slot - fromSlot };
                }
            }
        }
        return { nextSlot: fromSlot + 400, slotsUntil: 400 };
    }
    addJitoValidator(pubkey) {
        this.knownJitoValidators.add(pubkey);
    }
    setKnownJitoValidators(validators) {
        this.knownJitoValidators = new Set(validators);
    }
    estimateCongestion(slot) {
        if (!this.cachedSchedule)
            return 'medium';
        const epochStartSlot = this.currentEpoch * types_1.SLOTS_PER_EPOCH;
        const epochProgress = (slot - epochStartSlot) / types_1.SLOTS_PER_EPOCH;
        if (epochProgress < 0.05 || epochProgress > 0.95) {
            return 'extreme';
        }
        if (epochProgress < 0.15 || epochProgress > 0.85) {
            return 'high';
        }
        if (epochProgress < 0.3 || epochProgress > 0.7) {
            return 'medium';
        }
        return 'low';
    }
    getCurrentSlot() {
        return this.currentSlot;
    }
    isJitoSlot(slot) {
        const leader = this.getLeaderForSlot(slot);
        return leader ? this.knownJitoValidators.has(leader) : false;
    }
    stop() {
        if (this.scheduleRefreshInterval) {
            clearInterval(this.scheduleRefreshInterval);
        }
    }
}
exports.LeaderMonitor = LeaderMonitor;
//# sourceMappingURL=leader-monitor.js.map