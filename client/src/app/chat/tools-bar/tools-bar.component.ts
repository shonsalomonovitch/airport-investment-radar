import { Component, Input, signal } from '@angular/core';
import { Capability } from '../../services/agent.service';

@Component({
  selector: 'app-tools-bar',
  standalone: true,
  templateUrl: './tools-bar.component.html',
  styleUrl: './tools-bar.component.css',
})
export class ToolsBarComponent {
  @Input() capabilities: Capability[] = [];

  expanded = signal(false);

  toggle(): void {
    this.expanded.update(v => !v);
  }

  capEmoji(displayName: string): string {
    const n = displayName.toLowerCase();
    if (n.includes('analyze')) return '📊';
    if (n.includes('compare')) return '⚖️';
    if (n.includes('rank')) return '🏆';
    if (n.includes('long-haul') || n.includes('long haul')) return '🗺️';
    if (n.includes('unmet') || n.includes('demand')) return '📈';
    return '✈️';
  }
}
