import { toast } from 'frappe-ui'
import { net } from '../api'
import { t } from '../i18n'

/** Tell the person what happened to a change: done now, or kept on the device to be sent. */
export function saved(res, title, description = '') {
  if (res?.queued) {
    toast.info(t('Saved on this device'), {
      description: net.online ? t('It is being sent.') : t('It will be sent automatically when you are back online.'),
    })
  } else toast.success(title, description ? { description } : {})
}
