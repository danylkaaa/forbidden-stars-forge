import { useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { GeneratingSpinner } from '../../components/GeneratingSpinner'
import { CharacterPlacementDialog } from './CharacterPlacementDialog'
import { deleteCharacter, syncCharacter, uploadCharacter, type FactionCharacter } from './characters'

// The faction's character picture, uploaded once per faction: sent to OpenAI with the prompt whenever this faction's card is generated.
export function CharacterPicker({ factionId, character }: { factionId: number; character: FactionCharacter | undefined }) {
  const queryClient = useQueryClient()
  const input = useRef<HTMLInputElement>(null)
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['faction-characters'] })
  const upload = useMutation({ mutationFn: (file: File) => uploadCharacter(factionId, file), onSettled: refresh })
  const sync = useMutation({ mutationFn: () => syncCharacter(factionId), onSettled: refresh })
  const remove = useMutation({ mutationFn: () => deleteCharacter(factionId), onSettled: refresh })
  const busy = upload.isPending || sync.isPending || remove.isPending
  const syncError = (sync.data ?? upload.data)?.sync_error
  const error = upload.error ?? sync.error ?? remove.error
  const [placing, setPlacing] = useState(false)

  return <div className="flex flex-col gap-2">
    <span className="text-xs text-ink/70">Faction character (optional)</span>
    <div className="flex items-center gap-3 rounded-md border border-divider bg-bg p-2">
      <button type="button" aria-label={character ? 'Replace character image' : 'Upload character image'} disabled={busy}
        onClick={() => input.current?.click()}
        className="h-24 w-18 shrink-0 cursor-pointer overflow-hidden rounded border border-divider bg-transparent p-0 hover:border-accent disabled:cursor-wait focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
        {character ? <img src={character.url} alt="Faction character" className="h-full w-full object-contain" /> :
          <span className="flex h-full items-center justify-center border border-dashed border-divider text-2xl text-ink/50" aria-hidden="true">+</span>}
      </button>
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" hidden
        onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ''; if (file) upload.mutate(file) }} />
      <div className="min-w-0 flex-1 text-xs">
        {busy ? <span role="status" className="inline-flex items-center gap-2 text-ink/70"><GeneratingSpinner seed={0} size="sm" />
          {upload.isPending ? 'Uploading and syncing to OpenAI…' : sync.isPending ? 'Syncing to OpenAI…' : 'Removing…'}</span> :
          !character ? <p className="m-0 text-ink/55">Upload a picture of the faction’s character. It is sent with the prompt for this faction’s card.</p> :
          <>
            <p className="m-0 text-ink">{character.synced ? 'Synced to OpenAI, referenced in the prompt' : 'Not synced to OpenAI yet'}</p>
            {!character.synced && syncError && <p role="alert" className="mt-1 mb-0 break-words text-danger">{syncError}</p>}
            <div className="mt-2 flex gap-3">
              {!character.synced && <button type="button" onClick={() => sync.mutate()} className="cursor-pointer border-0 bg-transparent p-0 text-xs text-accent">Sync now</button>}
              <button type="button" onClick={() => setPlacing(true)} className="cursor-pointer border-0 bg-transparent p-0 text-xs text-accent">Position on template</button>
              <button type="button" onClick={() => remove.mutate()} className="cursor-pointer border-0 bg-transparent p-0 text-xs text-accent">Remove character</button>
            </div>
          </>}
        {error && <p role="alert" className="mt-1 mb-0 break-words text-danger">{error instanceof Error ? error.message : 'Character update failed.'}</p>}
      </div>
    </div>
    {placing && character && <CharacterPlacementDialog factionId={factionId} character={character} onClose={() => setPlacing(false)} />}
  </div>
}
