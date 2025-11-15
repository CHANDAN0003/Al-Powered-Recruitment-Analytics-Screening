import os
import gradio as gr


def build_minimal():
    with gr.Blocks(title="Minimal Test App") as demo:
        gr.Markdown("# Minimal Health Check")
        inp = gr.Textbox(label="Echo Input")
        out = gr.Textbox(label="Output")
        btn = gr.Button("Echo")

        def echo(x):
            return x

        btn.click(echo, inp, out)
    return demo


if __name__ == "__main__":
    ui = build_minimal()
    # Disable API docs and enable share link for quick external access
    ui.launch(server_name="127.0.0.1", server_port=int(os.getenv("PORT", "7861")), show_api=False, share=True)
