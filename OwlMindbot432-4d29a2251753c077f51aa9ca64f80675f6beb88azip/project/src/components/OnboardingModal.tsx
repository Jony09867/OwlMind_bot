import { useState } from 'react';
import { GlassButton, Modal } from './ui';
import { store, useStore } from '../store';
import { getTelegramUserName } from '../telegram';

const AVATARS = ['🦉', '🦊', '🐱', '🐰', '🐼', '🦁', '🐨', '🐸', '🐯', '🦄', '🐺', '🦝'];

export function OnboardingModal() {
  const onboarded = useStore((s) => s.onboarded);
  const [step, setStep] = useState(0);
  const [name, setName] = useState(getTelegramUserName() ?? '');
  const [avatar, setAvatar] = useState('🦉');

  if (onboarded) return null;

  const finish = () => {
    store.completeOnboarding({ name: name.trim() || 'You', avatar });
  };

  return (
    <Modal open={!onboarded} onClose={() => {}}>
      <div className="space-y-5">
        {step === 0 && (
          <div className="text-center space-y-4 animate-fade-in">
            <div className="text-6xl mb-2">🦉</div>
            <h2 className="font-display text-2xl font-extrabold">Welcome to OwlMind</h2>
            <p className="text-sm text-neutralt-500 dark:text-neutralt-400">
              Your motivational study companion. Focus, track progress, and study with friends.
            </p>
            <GlassButton className="w-full" onClick={() => setStep(1)}>Get Started</GlassButton>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4 animate-fade-in">
            <h2 className="font-display text-xl font-bold text-center">What should we call you?</h2>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              className="w-full glass-subtle rounded-2xl px-4 py-3 font-medium outline-none focus:ring-2 ring-accent/40 bg-transparent text-center"
            />
            <GlassButton className="w-full" onClick={() => setStep(2)} disabled={!name.trim()}>Continue</GlassButton>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4 animate-fade-in">
            <h2 className="font-display text-xl font-bold text-center">Pick your avatar</h2>
            <div className="grid grid-cols-4 gap-3">
              {AVATARS.map((a) => (
                <button
                  key={a}
                  onClick={() => setAvatar(a)}
                  className={`aspect-square rounded-2xl text-3xl flex items-center justify-center transition-all glass-press ${
                    avatar === a ? 'bg-accent/20 ring-2 ring-accent scale-105' : 'glass-subtle'
                  }`}
                >
                  {a}
                </button>
              ))}
            </div>
            <GlassButton className="w-full" onClick={finish}>Start Studying</GlassButton>
          </div>
        )}
      </div>
    </Modal>
  );
}
