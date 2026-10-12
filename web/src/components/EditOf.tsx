// "✎ edit of <parent>" marker for area-edit results; hover shows the instruction.
export function EditOf({ gen }: { gen: { parent_name: string; edit_instruction: string } }) {
  return (
    <span className="ml-1.5 font-sans text-[11px] text-accent" title={`Edit: ${gen.edit_instruction}`}>
      ✎ edit of {gen.parent_name}
    </span>
  )
}
