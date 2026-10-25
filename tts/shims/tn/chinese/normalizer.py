"""輕量版中文文字正規化，取代需要 pynini 的 WeTextProcessing（macOS 無法安裝）。
把數字、年份、百分比、時間、小數轉成中文讀法，其餘文字原樣保留。"""
import re

DIGITS = "零一二三四五六七八九"
UNITS = ["", "十", "百", "千"]
BIG = ["", "萬", "億", "兆"]


def _section(n: int) -> str:
    out = ""
    zero = False
    for i in range(3, -1, -1):
        d = n // (10 ** i) % 10
        if d == 0:
            zero = bool(out)
            continue
        if zero:
            out += "零"
            zero = False
        out += DIGITS[d] + UNITS[i]
    return out


def number(n: int) -> str:
    if n == 0:
        return "零"
    parts = []
    idx = 0
    need_zero = False
    while n > 0:
        sec = n % 10000
        if sec:
            s = _section(sec) + BIG[idx]
            if need_zero:
                s += "零"
            parts.insert(0, s)
            need_zero = sec < 1000
        else:
            need_zero = bool(parts)
        n //= 10000
        idx += 1
    text = "".join(parts).rstrip("零")
    if text.startswith("一十"):
        text = text[1:]
    return text.replace("二千", "兩千").replace("二萬", "兩萬").replace("二億", "兩億").replace("二百", "兩百")


def digits(s: str) -> str:
    return "".join(DIGITS[int(c)] for c in s)


class Normalizer:
    def __init__(self, *args, **kwargs):
        pass

    def normalize(self, text: str) -> str:
        text = re.sub(r"(\d{1,2}):(\d{2})", lambda m: f"{number(int(m[1]))}點{number(int(m[2])) + '分' if int(m[2]) else ''}", text)
        text = re.sub(r"(\d{4})年", lambda m: digits(m[1]) + "年", text)
        text = re.sub(r"(\d+(?:\.\d+)?)%", lambda m: "百分之" + self._num(m[1]), text)
        # 單獨的 2 後面接量詞時念「兩」：兩小時、兩個人
        text = re.sub(r"(?<![\d.])2(?=[個位隻張杯次天週周年月分秒小件條本台輛種碗份家場塊間])", "兩", text)
        text = re.sub(r"\d+(?:\.\d+)?", lambda m: self._num(m[0]), text)
        return text

    def _num(self, s: str) -> str:
        if "." in s:
            a, b = s.split(".", 1)
            return number(int(a)) + "點" + digits(b)
        if len(s) > 1 and s.startswith("0"):
            return digits(s)
        return number(int(s))
