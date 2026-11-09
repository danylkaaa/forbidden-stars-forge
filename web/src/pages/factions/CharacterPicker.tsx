import { useRef } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { GeneratingSpinner } from '../../components/GeneratingSpinner'
import { deleteCharacter, uploadCharacter, type FactionCharacter } from './characters'

// The faction's character picture, uploaded once per faction: "with character" image types in AI Lab are painted around it.
export function CharacterPicker({ factionId, character }: { factionId: number; character: FactionCharacter | undefined }) {
  const queryClient = useQueryClient()
  const input = useRef<HTMLInputElement>(null)
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['faction-characters'] })
  const upload = useMutation({ mutationFn: (file: File) => uploadCharacter(factionId, file), onSettled: refresh })
  const remove = useMutation({ mutationFn: () => deleteCharacter(factionId), onSettled: refresh })
  const busy = upload.isPending || remove.isPending
  const error = upload.error ?? remove.error

  return <div className="flex flex-col gap-2">
    <span className="text-xs text-ink/70">Faction character</span>
    <div className="flex items-center gap-3 rounded-md border border-divider bg-bg p-2">
      <button type="button" aria-label={character ? 'Replace character image' : 'Upload character image'} disabled={busy}
        onClick={() => input.current?.click()}
        className="h-24 w-18 shrink-0 cursor-pointer overflow-hidden rounded border border-divider bg-transparent p-0 hover:border-accent disabled:cursor-wait focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
        {character ? <img src={character.url} alt="Faction character" className="h-full w-full object-contain" /> :
          <span className="flex h-full items-center justify-center border border-dashed border-divider text-2xl text-ink/50" aria-hidden="true">+</span>}
      </button>
      <input ref={input} type="file" accept="image/png,image/jpeg" hidden
        onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ''; if (file) upload.mutate(file) }} />
      <div className="min-w-0 flex-1 text-xs">
        {busy ? <span role="status" className="inline-flex items-center gap-2 text-ink/70"><GeneratingSpinner seed={0} size="sm" />{upload.isPending ? 'Uploading…' : 'Removing…'}</span> :
          !character ? <p className="m-0 text-ink/55">Upload the faction’s character as a PNG with a transparent background. AI Lab paints “with character” images around it.</p> :
          <>
            <p className="m-0 text-ink">Click the picture to replace it. “With character” image types are painted around it.</p>
            <button type="button" onClick={() => remove.mutate()} className="mt-2 cursor-pointer border-0 bg-transparent p-0 text-xs text-accent">Remove character</button>
          </>}
        {error && <p role="alert" className="mt-1 mb-0 break-words text-danger">{error instanceof Error ? error.message : 'Character update failed.'}</p>}
      </div>
    </div>
  </div>
}
