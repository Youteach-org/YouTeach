import importlib.util
from pathlib import Path
from types import SimpleNamespace

MODULE_PATH = Path(__file__).parents[1] / "tools" / "oral-exam" / "gemini_transcribe.py"
spec = importlib.util.spec_from_file_location("gemini_transcribe", MODULE_PATH)
mod = importlib.util.module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(mod)


def test_generation_config_is_verbatim_with_diarization_and_word_timestamps():
    assert mod.build_generation_config() == {
        "transcription_config": {
            "mode": {
                "type": "verbatim",
                "diarization_mode": "speaker",
                "timestamp_granularities": ["word"],
            }
        }
    }


def test_extracts_only_word_info_annotations():
    interaction = SimpleNamespace(
        steps=[SimpleNamespace(content=[SimpleNamespace(annotations=[
            SimpleNamespace(type="word_info", text="Hello", speaker="spk_1", start_offset="0.1s", end_offset="0.4s"),
            SimpleNamespace(type="other", text="ignored"),
            SimpleNamespace(type="word_info", text="there", speaker="spk_1", start_offset="0.5s", end_offset="0.8s"),
        ])])]
    )
    assert mod.extract_word_annotations(interaction) == [
        {"text": "Hello", "speaker": "spk_1", "start_offset": "0.1s", "end_offset": "0.4s"},
        {"text": "there", "speaker": "spk_1", "start_offset": "0.5s", "end_offset": "0.8s"},
    ]


def test_groups_consecutive_words_without_relabeling_speakers():
    words = [
        {"text": "Who", "speaker": "spk_1", "start_offset": "0.1s", "end_offset": "0.2s"},
        {"text": "helped", "speaker": "spk_1", "start_offset": "0.3s", "end_offset": "0.6s"},
        {"text": "You", "speaker": "spk_2", "start_offset": "0.7s", "end_offset": "0.9s"},
    ]
    assert mod.group_speaker_turns(words) == [
        {"speaker": "spk_1", "start_offset": "0.1s", "end_offset": "0.6s", "heard": "Who helped"},
        {"speaker": "spk_2", "start_offset": "0.7s", "end_offset": "0.9s", "heard": "You"},
    ]


def test_markdown_marks_stage1_as_uncorrected_evidence():
    text = mod.render_markdown({
        "pair_slug": "paul-paulina",
        "model": "gemini-3.5-transcribe",
        "turns": [{"speaker": "spk_1", "start_offset": "0s", "end_offset": "1s", "heard": "say me"}],
    })
    assert "Stage 1 evidence only" in text
    assert "say me" in text
