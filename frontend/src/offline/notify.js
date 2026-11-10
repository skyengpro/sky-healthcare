import { toast } from 'frappe-ui'
import { net } from '../api'
import { t } from '../i18n'

/** Tell the person what happened to a change: done now, or kept on the device to be sent. */
export function saved(res, title, description = '') {
  if (res?.unsaved) {
    // storage is full or blocked: the change is only in this page
    toast.warning(t('Not saved on this device'), { description: t('Keep this page open until it is sent.') })
  } else if (res?.queued) {
    toast.info(t('Saved on this device'), {
      description: net.online ? t('It is being sent.') : t('It will be sent automatically when you are back online.'),
    })
  } else toast.success(title, description ? { description } : {})
}
