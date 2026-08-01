"use client"

import * as React from "react"
import { json } from "@codemirror/lang-json"
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language"
import type { Extension } from "@codemirror/state"
import { Compartment, EditorState } from "@codemirror/state"
import { basicSetup, EditorView } from "codemirror"
import { openSearchPanel } from "@codemirror/search"
import { tags } from "@lezer/highlight"
import { cn } from "@/lib/utils"

export type BodyEditorHandle = {
  openSearch: () => void
}

type BodyEditorProps = {
  value: string
  onChange?: (value: string) => void
  contentType?: string
  readOnly?: boolean
  lineWrapping?: boolean
  className?: string
}

export const BodyEditor = React.forwardRef<BodyEditorHandle, BodyEditorProps>(
  function BodyEditor(
    {
      value,
      onChange,
      contentType,
      readOnly = false,
      lineWrapping = false,
      className,
    },
    ref
  ) {
    const containerRef = React.useRef<HTMLDivElement | null>(null)
    const viewRef = React.useRef<EditorView | null>(null)
    const onChangeRef = React.useRef(onChange)
    const languageCompartment = React.useRef(new Compartment())
    const wrappingCompartment = React.useRef(new Compartment())
    const readOnlyCompartment = React.useRef(new Compartment())

    React.useImperativeHandle(ref, () => ({
      openSearch() {
        const view = viewRef.current
        if (view) {
          openSearchPanel(view)
          view.focus()
        }
      },
    }))

    React.useEffect(() => {
      onChangeRef.current = onChange
    }, [onChange])

    React.useEffect(() => {
      if (!containerRef.current) {
        return
      }

      const view = new EditorView({
        parent: containerRef.current,
        state: EditorState.create({
          doc: value,
          extensions: [
            basicSetup,
            editorTheme,
            syntaxHighlighting(editorHighlightStyle),
            EditorView.updateListener.of((update) => {
              if (update.docChanged) {
                onChangeRef.current?.(update.state.doc.toString())
              }
            }),
            languageCompartment.current.of(getLanguageExtension(contentType)),
            wrappingCompartment.current.of(getWrappingExtension(lineWrapping)),
            readOnlyCompartment.current.of(getReadOnlyExtension(readOnly)),
          ],
        }),
      })

      viewRef.current = view

      return () => {
        view.destroy()
        viewRef.current = null
      }
    }, [])

    React.useEffect(() => {
      const view = viewRef.current
      if (!view) {
        return
      }

      const currentValue = view.state.doc.toString()
      if (currentValue !== value) {
        view.dispatch({
          changes: {
            from: 0,
            to: currentValue.length,
            insert: value,
          },
        })
      }
    }, [value])

    React.useEffect(() => {
      viewRef.current?.dispatch({
        effects: languageCompartment.current.reconfigure(
          getLanguageExtension(contentType)
        ),
      })
    }, [contentType])

    React.useEffect(() => {
      viewRef.current?.dispatch({
        effects: wrappingCompartment.current.reconfigure(
          getWrappingExtension(lineWrapping)
        ),
      })
    }, [lineWrapping])

    React.useEffect(() => {
      viewRef.current?.dispatch({
        effects: readOnlyCompartment.current.reconfigure(
          getReadOnlyExtension(readOnly)
        ),
      })
    }, [readOnly])

    return (
      <div
        ref={containerRef}
        className={cn(
          "min-h-0 flex-1 overflow-hidden bg-background text-sm",
          className
        )}
      />
    )
  }
)

function getLanguageExtension(contentType?: string): Extension {
  return contentType?.toLowerCase().includes("json") ? json() : []
}

function getWrappingExtension(lineWrapping: boolean): Extension {
  return lineWrapping ? EditorView.lineWrapping : []
}

function getReadOnlyExtension(readOnly: boolean): Extension {
  return [EditorState.readOnly.of(readOnly), EditorView.editable.of(!readOnly)]
}

const editorTheme = EditorView.theme({
  "&": {
    height: "100%",
    backgroundColor: "var(--background)",
    color: "var(--editor-foreground)",
    fontSize: "13px",
  },
  ".cm-scroller": {
    fontFamily:
      'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
    lineHeight: "1.55",
  },
  ".cm-content": {
    padding: "12px 0",
  },
  ".cm-line": {
    padding: "0 16px",
  },
  ".cm-gutters": {
    backgroundColor: "color-mix(in oklch, var(--muted), transparent 60%)",
    color: "var(--muted-foreground)",
    borderRight: "1px solid var(--border)",
  },
  ".cm-activeLineGutter, .cm-activeLine": {
    backgroundColor: "color-mix(in oklch, var(--muted), transparent 55%)",
  },
  ".cm-cursor": {
    borderLeftColor: "var(--editor-foreground)",
  },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
    backgroundColor: "color-mix(in oklch, var(--primary), transparent 82%)",
  },
  "&.cm-focused": {
    outline: "none",
  },
})

const editorHighlightStyle = HighlightStyle.define([
  {
    tag: [tags.keyword, tags.bool, tags.null],
    color: "var(--editor-keyword)",
  },
  {
    tag: [tags.string, tags.special(tags.string)],
    color: "var(--editor-string)",
  },
  { tag: tags.number, color: "var(--editor-number)" },
  {
    tag: [tags.propertyName, tags.attributeName],
    color: "var(--editor-property)",
  },
  {
    tag: tags.comment,
    color: "var(--muted-foreground)",
    fontStyle: "italic",
  },
  { tag: tags.invalid, color: "var(--destructive)" },
])
