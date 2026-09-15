/** Notification preference helpers in Home Assistant. */

export const POOL_PUMP_OFF_EMAIL_ENABLED_ENTITY = 'input_boolean.pool_pump_off_email_enabled'

export const DEVICE_COMM_FAILURE_EMAIL_ENABLED_ENTITY =
  'input_boolean.device_comm_failure_email_enabled'

export const DEVICE_COMM_FAILURE_MINUTES_ENTITY =
  'input_number.device_comm_failure_minutes'

export const COMMAND_FAILED_EMAIL_ENABLED_ENTITY =
  'input_boolean.command_failed_email_enabled'

export const POOL_LOW_WATER_EMAIL_ENABLED_ENTITY =
  'input_boolean.pool_low_water_email_enabled'

export const POOL_LOW_WATER_INCHES_ENTITY = 'input_number.pool_low_water_inches'

export const POND_LOW_WATER_EMAIL_ENABLED_ENTITY =
  'input_boolean.pond_low_water_email_enabled'

export const POND_LOW_WATER_INCHES_ENTITY = 'input_number.pond_low_water_inches'

export const CISTERN_LOW_WATER_EMAIL_ENABLED_ENTITY =
  'input_boolean.cistern_low_water_email_enabled'

export const CISTERN_LOW_WATER_PERCENT_ENTITY = 'input_number.cistern_low_water_percent'

export {
  DOORBELL_EMAIL_ENABLED_ENTITY,
  DOORBELL_ICON_MINUTES_ENTITY,
  DEFAULT_DOORBELL_ICON_MINUTES,
} from './doorbell'

/** Synced from pool-map / pond-map depthOffset for HA automations. */
export const POOL_WATER_LEVEL_OFFSET_ENTITY = 'input_number.pool_water_level_offset'
export const POND_WATER_LEVEL_OFFSET_ENTITY = 'input_number.pond_water_level_offset'

/** Master channel: send email for enabled alert conditions. */
export const DASHBOARD_NOTIFY_EMAIL_ENABLED_ENTITY =
  'input_boolean.dashboard_notify_email_enabled'

/** Master channel: send phone push for enabled alert conditions. */
export const DASHBOARD_NOTIFY_PHONE_ENABLED_ENTITY =
  'input_boolean.dashboard_notify_phone_enabled'

/** Optional override recipient. Empty = HA SMTP default recipient. */
export const DASHBOARD_NOTIFY_EMAIL_ENTITY = 'input_text.dashboard_notify_email'

/** Companion-app notify entity (e.g. notify.holdens_iphone). */
export const DASHBOARD_NOTIFY_PHONE_ENTITY = 'input_text.dashboard_notify_phone'

export const DEFAULT_DEVICE_COMM_FAILURE_MINUTES = 15
export const DEFAULT_POOL_LOW_WATER_INCHES = -1
export const DEFAULT_POND_LOW_WATER_INCHES = -2
export const DEFAULT_CISTERN_LOW_WATER_PERCENT = 50

export const DEFAULT_NOTIFY_RECIPIENT = ''

/** HA notify entity used when no override email is set (SMTP recipient). */
export const DEFAULT_SMTP_NOTIFY_ENTITY = 'notify.stoneridge_holden_caine'

/** Default Companion App notify target for phone alerts. */
export const DEFAULT_PHONE_NOTIFY_ENTITY = 'notify.holdens_iphone'

/** Selectable phone notify targets for Settings. */
export const PHONE_NOTIFY_TARGETS: { entityId: string; label: string }[] = [
  { entityId: 'notify.holdens_iphone', label: "Holden's iPhone" },
  { entityId: 'notify.sm_x620', label: 'SM-X620' },
  { entityId: 'notify.ipad', label: 'iPad' },
  { entityId: 'notify.my_ipad', label: 'My iPad' },
]
