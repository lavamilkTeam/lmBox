use crate::contracts::{LogicDisplay, LogicSignal as Signal};

/// Logical write interface only; no busy flag, electrical model, or instruction delays.
#[derive(Clone)]
pub(super) struct Lcd {
    memory: [u8; 128],
    address: u8,
    shift: u8,
    four_bit: bool,
    two_lines: bool,
    display_on: bool,
    cursor_on: bool,
    blink: bool,
    increment: bool,
    entry_shift: bool,
    cgram: bool,
    unsupported_font: bool,
    initializing: bool,
    pending: Option<(bool, u8)>,
    previous_enable: Signal,
    warning: Option<String>,
}

fn bit(value: Signal) -> Option<u8> {
    match value {
        Signal::Zero => Some(0),
        Signal::One => Some(1),
        _ => None,
    }
}

fn bus(values: &[Signal]) -> Option<u8> {
    values
        .iter()
        .enumerate()
        .try_fold(0, |result, (index, value)| {
            Some(result | (bit(*value)? << index))
        })
}

fn glyph(code: u8) -> Option<char> {
    // Common HD44780U A00 ROM subset. Other ROM/CGRAM glyphs remain explicit unknowns.
    match code {
        0x20..=0x5b | 0x5d..=0x7d => Some(char::from(code)),
        0x5c => Some('¥'),
        0x7e => Some('→'),
        0x7f => Some('←'),
        _ => None,
    }
}

impl Lcd {
    pub fn uses_four_bit_bus(&self) -> bool {
        self.four_bit
    }

    pub fn new(enable: Signal) -> Self {
        Self {
            memory: [b' '; 128],
            address: 0,
            shift: 0,
            four_bit: false,
            two_lines: false,
            display_on: false,
            cursor_on: false,
            blink: false,
            increment: true,
            entry_shift: false,
            cgram: false,
            unsupported_font: false,
            initializing: true,
            pending: None,
            previous_enable: enable,
            warning: None,
        }
    }

    pub fn observe(&mut self, inputs: &[Signal]) {
        let enable = inputs[2];
        let previous = self.previous_enable;
        self.previous_enable = enable;
        if previous != Signal::One || enable != Signal::Zero {
            if (previous == Signal::One && bit(enable).is_none())
                || (bit(previous).is_none() && enable == Signal::Zero)
            {
                self.fail("E 跳变不确定，未接收本次数据");
            }
            return;
        }
        match bit(inputs[1]) {
            Some(0) => {}
            Some(_) => {
                self.fail("尚未实现 LCD 读取、忙标志或双向数据总线");
                return;
            }
            None => {
                self.fail("R/W 不确定，未接收本次数据");
                return;
            }
        }
        let Some(rs) = bit(inputs[0]).map(|value| value == 1) else {
            self.fail("RS 不确定，未接收本次数据");
            return;
        };
        let Some(high) = bus(&inputs[7..11]) else {
            self.fail("LCD 数据总线含 X 或 Z，未接收本次数据");
            return;
        };
        if self.four_bit {
            if let Some((previous_rs, upper)) = self.pending.take() {
                if previous_rs != rs {
                    self.fail("4 位传输的两个半字节 RS 不一致，数据已丢弃");
                    return;
                }
                self.execute(rs, (upper << 4) | high);
            } else {
                self.pending = Some((rs, high));
            }
            return;
        }
        if let Some(low) = bus(&inputs[3..7]) {
            self.execute(rs, (high << 4) | low);
        } else if self.initializing && !rs && matches!(high, 2 | 3) {
            // Datasheet initialization uses only DB7..DB4; DB3..DB0 are don't-care.
            self.four_bit = high == 2;
            self.pending = None;
            self.warning = None;
        } else {
            self.fail("8 位传输的数据总线含 X 或 Z，未接收本次数据");
        }
    }

    fn fail(&mut self, message: &str) {
        self.pending = None;
        self.warning = Some(message.to_owned());
    }

    fn execute(&mut self, data: bool, value: u8) {
        self.warning = None;
        if data {
            self.initializing = false;
            if self.cgram {
                self.warning = Some("尚未实现 CGRAM 自定义字形写入".into());
                return;
            }
            if !self.valid_address(self.address) {
                self.warning = Some("DDRAM 地址超出当前行模式范围".into());
                return;
            }
            self.memory[usize::from(self.address)] = value;
            if glyph(value).is_none() {
                self.warning = Some(format!("尚未实现字形 0x{value:02X}，显示为替代字符"));
            }
            self.advance_address(self.increment);
            if self.entry_shift {
                self.shift_display(!self.increment);
            }
            return;
        }
        if value & 0xe0 == 0x20 {
            // A 4-bit 0x33 can begin resynchronization back through the 8-bit interface.
            self.initializing = true;
            self.four_bit = value & 0x10 == 0;
            self.two_lines = value & 0x08 != 0;
            // F is ignored in two-line mode according to the controller instruction table.
            self.unsupported_font = !self.two_lines && value & 0x04 != 0;
            self.pending = None;
            self.shift %= self.line_length();
            return;
        }
        self.initializing = false;
        if value & 0x80 != 0 {
            let address = value & 0x7f;
            if self.valid_address(address) {
                self.address = address;
                self.cgram = false;
            } else {
                self.warning = Some("DDRAM 地址超出当前行模式范围".into());
            }
        } else if value & 0x40 != 0 {
            self.cgram = true;
            self.warning = Some("尚未实现 CGRAM 自定义字形".into());
        } else if value & 0x10 != 0 {
            if value & 0x08 != 0 {
                self.shift_display(value & 0x04 != 0);
            } else {
                self.advance_address(value & 0x04 != 0);
            }
        } else if value & 0x08 != 0 {
            self.display_on = value & 0x04 != 0;
            self.cursor_on = value & 0x02 != 0;
            self.blink = value & 0x01 != 0;
        } else if value & 0x04 != 0 {
            self.increment = value & 0x02 != 0;
            self.entry_shift = value & 0x01 != 0;
        } else if value & 0x02 != 0 {
            self.address = 0;
            self.shift = 0;
            self.cgram = false;
        } else if value == 1 {
            self.memory.fill(b' ');
            self.address = 0;
            self.shift = 0;
            self.cgram = false;
            self.increment = true;
        } else {
            self.warning = Some("未定义的 LCD 指令 0x00".into());
        }
    }

    fn line_length(&self) -> u8 {
        if self.two_lines {
            40
        } else {
            80
        }
    }

    fn valid_address(&self, address: u8) -> bool {
        if self.two_lines {
            address <= 0x27 || (0x40..=0x67).contains(&address)
        } else {
            address <= 0x4f
        }
    }

    fn advance_address(&mut self, increment: bool) {
        self.address = if increment {
            match (self.two_lines, self.address) {
                (true, 0x27) => 0x40,
                (true, 0x67) | (false, 0x4f) => 0,
                _ => (self.address + 1) & 0x7f,
            }
        } else {
            match (self.two_lines, self.address) {
                (true, 0) => 0x67,
                (false, 0) => 0x4f,
                (true, 0x40) => 0x27,
                _ => self.address - 1,
            }
        };
    }

    fn shift_display(&mut self, right: bool) {
        let length = self.line_length();
        self.shift = (self.shift + if right { length - 1 } else { 1 }) % length;
    }

    pub fn view(&self) -> LogicDisplay {
        let mut rows = [" ".repeat(16), " ".repeat(16)];
        let mut cursor = None;
        if self.display_on && !self.unsupported_font {
            for (row, text) in rows
                .iter_mut()
                .enumerate()
                .take(if self.two_lines { 2 } else { 1 })
            {
                *text = (0..16)
                    .map(|column| {
                        let address = row as u8 * 0x40 + (self.shift + column) % self.line_length();
                        if self.cursor_on && !self.cgram && address == self.address {
                            cursor = Some(row as u32 * 16 + u32::from(column));
                        }
                        glyph(self.memory[usize::from(address)]).unwrap_or('\u{fffd}')
                    })
                    .collect();
            }
        }
        LogicDisplay {
            rows,
            cursor,
            display_on: self.display_on,
        }
    }

    pub fn diagnostic(&self) -> Option<&str> {
        if self.unsupported_font {
            Some("尚未实现 5×10 字形模式，显示结果暂不可用")
        } else if self.cgram {
            Some("尚未实现 CGRAM 自定义字形，写入不会修改 DDRAM")
        } else if let Some(message) = &self.warning {
            Some(message)
        } else if self.blink {
            Some("尚未实现光标闪烁时序")
        } else if self.memory.iter().any(|code| glyph(*code).is_none()) {
            Some("DDRAM 包含未实现字形，显示为替代字符")
        } else {
            None
        }
    }
}
