import { MinimumAgeRule } from "./minimum-age.rule.js";

// Config da secretaria ({type, ...}) -> regra. O inverso é rule.toJSON() (persistência).
export function ruleFromConfig(config) {
    switch (config.type) {
        case 'minimumAge': return new MinimumAgeRule(config.age);
        default: throw new TypeError(`Unknown rule ${config.type}`);
    }
}
