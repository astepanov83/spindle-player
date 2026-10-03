// Files dropped on the window: the folders among them become music folders
// (ticket 047). Main checks each path and says what it added.
import { dropText } from '../../library/scan-text'
import { notice } from '../../stores/notice.svelte'

export function filesDrop(dropped: File[]): void {
  void window.libraryApi.addDropped(dropped).then((r) => {
    const text = dropText(r)
    if (text) notice.show(text)
  })
}
