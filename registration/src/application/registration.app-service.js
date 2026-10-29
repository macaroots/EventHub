import { NotFoundError } from "../../../shared/domain/errors.js";
import { Activity, CapacityRule, Registration } from "../domain/activity.js";

export class RegistrationAppService {
    constructor(activityRepository, registrationRepository, userRepository, messageBus) {
        this.activityRepository = activityRepository;
        this.registrationRepository = registrationRepository;
        this.userRepository = userRepository;
        this.messageBus = messageBus;
    }
    async updateCapacity({ activityId, capacity }) {
        let activity = this.activityRepository.getById(activityId)
        if (!activity) {
            this.activityRepository.add(new Activity(activityId, capacity, [new CapacityRule()]));
        }
        else {
            activity.updateCapacity(capacity);
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
    }
}