import { COLOR_RAMPS } from '../../config/constants';

interface RampPickerProps {
  value: string;
  onChange: (ramp: string) => void;
}

/**
 * Displays each color ramp from COLOR_RAMPS as a horizontal gradient bar.
 * Clicking a ramp selects it and triggers onChange.
 */
export function RampPicker({ value, onChange }: RampPickerProps) {
  return (
    <div className="ramp-picker">
      {Object.entries(COLOR_RAMPS).map(([name, stops]) => {
        const gradient = `linear-gradient(to right, ${stops.join(', ')})`;
        const isSelected = value === name;
        return (
          <div
            key={name}
            className={`ramp-option${isSelected ? ' ramp-option--selected' : ''}`}
            onClick={() => onChange(name)}
            title={name}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '3px 4px',
              marginBottom: 2,
              borderRadius: 3,
              cursor: 'pointer',
              background: isSelected ? '#2d2d44' : 'transparent',
              border: isSelected ? '1px solid #42d4f4' : '1px solid transparent',
            }}
          >
            <div
              className="ramp-preview"
              style={{
                flex: 1,
                height: 14,
                borderRadius: 2,
                background: gradient,
              }}
            />
            <span
              className="ramp-name"
              style={{
                fontSize: 11,
                color: isSelected ? '#42d4f4' : '#aaa',
                minWidth: 72,
                textAlign: 'right',
              }}
            >
              {name}
            </span>
          </div>
        );
      })}
    </div>
  );
}
