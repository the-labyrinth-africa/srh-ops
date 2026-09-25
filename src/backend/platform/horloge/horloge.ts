/**
 * Port d'horloge : permet aux cas d'usage de dépendre du temps sans appeler `new Date()`
 * directement, pour être testables avec une horloge fixe ou avançant pas à pas.
 */
export interface Horloge {
  maintenant(): Date;
}

export class SystemClock implements Horloge {
  maintenant(): Date {
    return new Date();
  }
}
