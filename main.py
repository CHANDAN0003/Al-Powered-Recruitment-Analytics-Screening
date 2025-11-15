import os
import gradio as gr
from dotenv import load_dotenv

# Local imports
from database.db_manager import DBManager
from auth.login_manager import signup_start, signup_verify, login_start, login_verify, AuthError
from ui.recruiter_ui import recruiter_panel
from ui.candidate_ui import candidate_panel

# Load environment variables
load_dotenv()

# Initialize DB connection
db = DBManager()

# Path to CSS file
STATIC_CSS = os.path.join(os.path.dirname(__file__), "static", "styles.css")


def app():
    """
    Main Gradio App for AI Recruitment Portal
    """

    # --- Monkey patch: mitigate gradio_client 'bool not iterable' when schema additionalProperties is False ---
    try:
        from gradio_client import utils as _gutils
        _orig_json_schema_to_python_type = _gutils.json_schema_to_python_type
        def _safe_json_schema_to_python_type(schema, defs=None):
            # Properly mirror original signature; handle boolean schemas gracefully.
            if isinstance(schema, bool):
                return "Any" if schema else "Never"
            return _orig_json_schema_to_python_type(schema, defs)
        _gutils.json_schema_to_python_type = _safe_json_schema_to_python_type
    except Exception:
        pass

    # Theme setup
    theme = gr.themes.Soft(
        primary_hue=gr.themes.colors.blue,
        neutral_hue=gr.themes.colors.gray,
    )

    # Build Gradio app
    with gr.Blocks(
        css=open(STATIC_CSS).read() if os.path.exists(STATIC_CSS) else None,
        theme=theme,
        title="AI Recruitment Portal",
    ) as demo:

        # Shared user state
        user_state = gr.State(value=None)

        # =====================================================
        # LANDING PAGE
        # =====================================================
        with gr.Column(visible=True) as landing:
            gr.Markdown("""
            <div style="text-align:center;padding:40px 0">
              <h1 style="font-size:40px;margin-bottom:10px">AI Recruitment Portal</h1>
              <p style="font-size:18px;color:#555">Match the right talent with the right role. Fast.</p>
            </div>
            """)
            with gr.Row():
                go_recruiter = gr.Button("I'm a Recruiter", variant="primary")
                go_candidate = gr.Button("I'm a Candidate")
            gr.Markdown("""
            <div style="text-align:center;color:#777;margin-top:20px">
              Secure OTP login • AI resume scoring • Recruiter analytics • Chatbot assistance
            </div>
            """)
            logout_btn = gr.Button("Logout", variant="secondary")

        # =====================================================
        # RECRUITER PAGE
        # =====================================================
        with gr.Column(visible=False) as recruiter_page:
            gr.Markdown("## 🧑‍💼 Recruiter Login / Signup")

            with gr.Tabs():
                # --- Recruiter Signup ---
                with gr.Tab("Signup"):
                    r_name = gr.Textbox(label="Full Name")
                    r_email = gr.Textbox(label="Email")
                    r_pass = gr.Textbox(label="Password", type="password")
                    r_signup_btn = gr.Button("Send OTP")
                    r_otp = gr.Textbox(label="Enter OTP")
                    r_verify_btn = gr.Button("Verify & Create Account")
                    r_signup_out = gr.Markdown()

                # --- Recruiter Login ---
                with gr.Tab("Login"):
                    r_login_email = gr.Textbox(label="Email")
                    r_login_pass = gr.Textbox(label="Password", type="password")
                    r_send_otp = gr.Button("Send OTP")
                    r_login_otp = gr.Textbox(label="Enter OTP")
                    r_login_btn = gr.Button("Login")
                    r_login_out = gr.Markdown()

            # Recruiter Dashboard Panel
            recruiter_dashboard = recruiter_panel(user_state)
            back_to_home_r = gr.Button("⬅ Back to Home")

        # =====================================================
        # CANDIDATE PAGE (with embedded Chatbot)
        # =====================================================
        with gr.Column(visible=False) as candidate_page:
            gr.Markdown("## 👩‍💻 Candidate Login / Signup")

            with gr.Tabs():
                # --- Candidate Signup ---
                with gr.Tab("Signup"):
                    c_name = gr.Textbox(label="Full Name")
                    c_email = gr.Textbox(label="Email")
                    c_pass = gr.Textbox(label="Password", type="password")
                    c_signup_btn = gr.Button("Send OTP")
                    c_otp = gr.Textbox(label="Enter OTP")
                    c_verify_btn = gr.Button("Verify & Create Account")
                    c_signup_out = gr.Markdown()

                # --- Candidate Login ---
                with gr.Tab("Login"):
                    c_login_email = gr.Textbox(label="Email")
                    c_login_pass = gr.Textbox(label="Password", type="password")
                    c_send_otp = gr.Button("Send OTP")
                    c_login_otp = gr.Textbox(label="Enter OTP")
                    c_login_btn = gr.Button("Login")
                    c_login_out = gr.Markdown()

            # Candidate Dashboard Panel
            candidate_dashboard = candidate_panel(user_state)

            # Embedded chatbot UI (simple row under candidate dashboard)
            with gr.Accordion("Chatbot Assistant", open=False):
                from ui.chatbot_ui import chatbot_panel
                _chat = chatbot_panel()
            back_to_home_c = gr.Button("⬅ Back to Home")


        # =====================================================
        # AUTH LOGIC — RECRUITER
        # =====================================================

        def r_signup_send(name, email, password):
            try:
                signup_start(name=name, email=email, password=password, role="recruiter")
                return "✅ OTP sent to your email."
            except AuthError as e:
                return f"❌ {e}"

        def r_signup_verify(name, email, password, code):
            try:
                signup_verify(
                    name=name, email=email, password=password, role="recruiter", code=code
                )
                user = db.get_user_by_email(email)
                return user, f"✅ Account created. Welcome, {name}!"
            except AuthError as e:
                return None, f"❌ {e}"

        def r_login_send(email):
            try:
                login_start(email=email)
                return "✅ OTP sent."
            except AuthError as e:
                return f"❌ {e}"

        def r_login_do(email, password, code):
            try:
                user = login_verify(email=email, password=password, code=code)
                return user, f"✅ Logged in as {user['name']}"
            except AuthError as e:
                return None, f"❌ {e}"

        def do_logout(current):
            # Clear user state; returning None resets dashboards dependent on role logic inside panels
            return None, "🔒 Logged out."

        # --- Connect Recruiter Events ---
        r_signup_btn.click(r_signup_send, [r_name, r_email, r_pass], r_signup_out)
        r_verify_btn.click(
            r_signup_verify, [r_name, r_email, r_pass, r_otp], [user_state, r_signup_out]
        )
        r_send_otp.click(r_login_send, [r_login_email], r_login_out)
        r_login_btn.click(
            r_login_do, [r_login_email, r_login_pass, r_login_otp], [user_state, r_login_out]
        )
        logout_btn.click(do_logout, [user_state], [user_state, r_login_out])

        # =====================================================
        # AUTH LOGIC — CANDIDATE
        # =====================================================

        def c_signup_send(name, email, password):
            try:
                signup_start(name=name, email=email, password=password, role="candidate")
                return "✅ OTP sent to your email."
            except AuthError as e:
                return f"❌ {e}"

        def c_signup_verify(name, email, password, code):
            try:
                signup_verify(
                    name=name, email=email, password=password, role="candidate", code=code
                )
                user = db.get_user_by_email(email)
                return user, f"✅ Account created. Welcome, {name}!"
            except AuthError as e:
                return None, f"❌ {e}"

        def c_login_send(email):
            try:
                login_start(email=email)
                return "✅ OTP sent."
            except AuthError as e:
                return f"❌ {e}"

        def c_login_do(email, password, code):
            try:
                user = login_verify(email=email, password=password, code=code)
                return user, f"✅ Logged in as {user['name']}"
            except AuthError as e:
                return None, f"❌ {e}"

        # --- Connect Candidate Events ---
        c_signup_btn.click(c_signup_send, [c_name, c_email, c_pass], c_signup_out)
        c_verify_btn.click(
            c_signup_verify, [c_name, c_email, c_pass, c_otp], [user_state, c_signup_out]
        )
        c_send_otp.click(c_login_send, [c_login_email], c_login_out)
        c_login_btn.click(
            c_login_do, [c_login_email, c_login_pass, c_login_otp], [user_state, c_login_out]
        )
        logout_btn.click(do_logout, [user_state], [user_state, c_login_out])

        # ======================
        # Navigation handlers
        # ======================
        def _go_recruiter():
            return [gr.update(visible=False), gr.update(visible=True), gr.update(visible=False)]

        def _go_candidate():
            return [gr.update(visible=False), gr.update(visible=False), gr.update(visible=True)]

        def _go_home():
            return [gr.update(visible=True), gr.update(visible=False), gr.update(visible=False)]

        go_recruiter.click(_go_recruiter, None, [landing, recruiter_page, candidate_page])
        go_candidate.click(_go_candidate, None, [landing, recruiter_page, candidate_page])
        back_to_home_r.click(_go_home, None, [landing, recruiter_page, candidate_page])
        back_to_home_c.click(_go_home, None, [landing, recruiter_page, candidate_page])

    return demo


if __name__ == "__main__":
    ui = app()
    # Re-enable API docs to avoid 'No API found' toasts; monkey patch prevents previous crash.
    ui.launch(server_name="127.0.0.1", server_port=int(os.getenv("PORT", "7860")), share=True)
