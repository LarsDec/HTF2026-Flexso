/**
 * Formatters for the Water app. Only translation: the status itself comes from the server.
 *
 * @namespace water.pipes.model
 */
const formatter = {
  /**
   * Picks the translated status text for the server's healthStatus.
   * Anything that is not fine/attention/alarm shows the "unknown" text, never a green "fine".
   */
  statusText(
    healthStatus: string | null | undefined,
    fine: string,
    attention: string,
    alarm: string,
    unknown: string
  ): string {
    switch (healthStatus) {
      case "fine":
        return fine;
      case "attention":
        return attention;
      case "alarm":
        return alarm;
      default:
        return unknown;
    }
  },
};

export default formatter;
