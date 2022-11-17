import {Observable, of as observableOf} from 'rxjs'
import {delay, mergeMap, switchMap, tap} from 'rxjs/operators'
import uniqBy from 'lodash/uniqBy'
import {SanityClient} from '@sanity/client'
import {SanityDocument} from 'sanity'

const draftId = (nonDraftDoc: SanityDocument) => `drafts.${nonDraftDoc._id}`

function prepareDocumentList(
  incoming: SanityDocument | SanityDocument[],
  client: SanityClient
): Promise<SanityDocument[]> {
  if (!incoming) {
    return Promise.resolve([])
  }
  const documents = Array.isArray(incoming) ? incoming : [incoming]

  const ids = documents.filter((doc) => !doc._id.startsWith('drafts.')).map(draftId)

  return client
    .fetch<SanityDocument[]>('*[_id in $ids]', {ids})
    .then((drafts) => {
      const outgoing = documents.map((doc) => {
        const foundDraft = drafts.find((draft) => draft._id === draftId(doc))
        return foundDraft || doc
      })
      return uniqBy(outgoing, '_id')
    })
    .catch((error) => {
      throw new Error(`Problems fetching docs ${ids}. Error: ${error.message}`)
    })
}

export function getSubscription(
  query: string,
  params: Record<string, any>,
  client: SanityClient
): Observable<SanityDocument[]> {
  return client
    .listen(query, params, {
      events: ['welcome', 'mutation'],
      includeResult: false,
      visibility: 'query',
    })
    .pipe(
      switchMap((event) => {
        return observableOf(1).pipe(
          event.type === 'welcome' ? tap() : delay(1000),
          mergeMap(() =>
            client
              .fetch(query, params)
              .then((incoming) => {
                return prepareDocumentList(incoming, client)
              })
              .catch((error) => {
                if (error.message.startsWith('Problems fetching docs')) {
                  throw error
                }
                throw new Error(
                  `Query failed ${query} and ${JSON.stringify(params)}. Error: ${error.message}`
                )
              })
          )
        )
      })
    )
}
