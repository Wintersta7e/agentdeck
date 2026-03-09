import { DndContext, closestCenter, type DragEndEvent } from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type React from 'react'
import './SortableList.css'

interface SortableListProps<T extends { id: string }> {
  items: T[]
  onReorder: (items: T[]) => void
  onRemove: (id: string) => void
  renderItem: (item: T) => React.ReactNode
}

interface SortableItemProps {
  id: string
  onRemove: (id: string) => void
  children: React.ReactNode
}

function SortableItem({ id, onRemove, children }: SortableItemProps): React.JSX.Element {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition: transition ?? undefined,
  }

  return (
    <div ref={setNodeRef} style={style} className={`sortable-item${isDragging ? ' dragging' : ''}`}>
      <span className="drag-handle" {...attributes} {...listeners}>
        &#x2807;
      </span>
      <div className="item-content">{children}</div>
      <button
        type="button"
        className="remove-btn"
        onClick={() => onRemove(id)}
        aria-label="Remove item"
      >
        &times;
      </button>
    </div>
  )
}

export function SortableList<T extends { id: string }>({
  items,
  onReorder,
  onRemove,
  renderItem,
}: SortableListProps<T>): React.JSX.Element {
  function handleDragEnd(event: DragEndEvent): void {
    const { active, over } = event
    if (over && active.id !== over.id) {
      const oldIndex = items.findIndex((i) => i.id === String(active.id))
      const newIndex = items.findIndex((i) => i.id === String(over.id))
      onReorder(arrayMove(items, oldIndex, newIndex))
    }
  }

  return (
    <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        {items.map((item) => (
          <SortableItem key={item.id} id={item.id} onRemove={onRemove}>
            {renderItem(item)}
          </SortableItem>
        ))}
      </SortableContext>
    </DndContext>
  )
}
