import { Component, Input, Output, EventEmitter, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-message-input',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './message-input.component.html',
  styleUrl: './message-input.component.css',
})
export class MessageInputComponent {
  @Input() loading = false;
  @Output() send = new EventEmitter<string>();

  text = signal('');

  submit(): void {
    const trimmed = this.text().trim();
    if (!trimmed || this.loading) return;
    this.send.emit(trimmed);
    this.text.set('');
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.submit();
    }
  }
}
