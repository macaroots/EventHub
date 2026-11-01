import { NotFoundError } from "../../../shared/domain/errors.js";
import { Activity, PaymentRule, Registration } from "../domain/activity.js";

export class RegistrationAppService {
    constructor(activityRepository, registrationRepository, userRepository, messageBus) {
        this.activityRepository = activityRepository;
        this.registrationRepository = registrationRepository;
        this.userRepository = userRepository;
        this.messageBus = messageBus;
    }
    // Projeção local da Activity da Secretaria (ActivityCreated/ActivityUpdated). Idempotente: upsert.
    upsertActivity({ activityId, capacity, price = 0 }) {
        const rules = price > 0 ? [new PaymentRule(price)] : [];
        const activity = this.activityRepository.getById(activityId);
        if (!activity) {
            this.activityRepository.add(new Activity(capacity, rules, activityId));
        }
        else {
            activity.setCapacity(capacity);
            activity.setRules(rules);
            this.activityRepository.update(activity);
        }
    }

    register({activityId, userId}) {
        const activity = this.activityRepository.getById(activityId);
        if (!activity) throw new NotFoundError('activity');
        const user = this.userRepository.getById(userId);
        if (!user) throw new NotFoundError('user');
        const registration = new Registration(user, activity);
        activity.register(registration);
        this.registrationRepository.add(registration);
        return registration.id;
    }
}